// The cartoon engine. Plays the walk-in entrance, interprets the scene script
// (scene.ts), renders dialogue and choices, runs the x402 actions (payment.ts),
// and hands the payment to the Ledger Stax review + hold-to-sign (ledger.ts).
// Honest by construction: the wrap line and honesty tag adapt to whether the
// signature is simulated or real.

import { SpriteActor } from "./actors.js";
import { initLedger, runStaxReview, setIdle } from "./ledger.js";
import {
  buildAuthorization,
  fetchConfig,
  fetchTerms,
  settle as settlePayment,
  shortHex,
  signAuthorization,
  type Config,
  type Forecast,
  type PaymentTerms,
  type Settlement,
  type Signed,
  type TypedData,
} from "./payment.js";
import { createSpriteCanvas, SPRITES } from "./sprites.js";
import { SCRIPT, START_NODE, type ActionKey, type SceneNode, type Speaker } from "./scene.js";

const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

interface Ctx {
  config: Config;
  terms?: PaymentTerms;
  typedData?: TypedData;
  signed?: Signed;
  settlement?: Settlement;
  forecast?: Forecast;
  values: Record<string, string>;
}
const ctx: Ctx = { config: { useRealSigner: false, network: "base" }, values: {} };

// ---- DOM ------------------------------------------------------------------
function el<T extends HTMLElement = HTMLElement>(id: string): T {
  const node = document.getElementById(id);
  if (!node) throw new Error(`Missing #${id}`);
  return node as T;
}

let dialogueBox: HTMLElement;
let speakerName: HTMLElement;
let dialogueText: HTMLElement;
let choicesEl: HTMLElement;
let buyoFig: HTMLElement;
let sellaFig: HTMLElement;
let buyoActor: SpriteActor;
let sellaActor: SpriteActor;

const SPEAKER_LABEL: Record<Speaker, string> = {
  buyo: "Buyo",
  sella: "Sella",
  narrator: "Narrator",
  ledger: "Ledger Stax",
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const cap = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);
const interpolate = (text: string) => text.replace(/\{(\w+)\}/g, (_, k) => ctx.values[k] ?? "");

// ---- actions (the x402 work) ---------------------------------------------
async function runAction(action: ActionKey): Promise<void> {
  switch (action) {
    case "fetch402": {
      const terms = await fetchTerms();
      ctx.terms = terms;
      ctx.values.price = terms.amountHuman;
      ctx.values.network = cap(terms.network);
      ctx.values.payTo = terms.payToDisplay;
      ctx.values.nonce = shortHex(terms.nonce, 8, 6);
      ctx.values.expiry = new Date(Number(terms.validBefore) * 1000).toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      });
      break;
    }
    case "buildAuth": {
      if (!ctx.terms) throw new Error("no terms");
      ctx.typedData = buildAuthorization(ctx.terms);
      break;
    }
    case "settle": {
      if (!ctx.typedData || !ctx.signed || !ctx.terms) throw new Error("nothing to settle");
      const { forecast, settlement } = await settlePayment(ctx.typedData, ctx.signed, ctx.terms);
      ctx.forecast = forecast;
      ctx.settlement = settlement;
      ctx.values.txHash = shortHex(settlement.txHash, 8, 6);
      ctx.values.settledIn = settlement.settledIn;
      ctx.values.network = cap(settlement.network);
      ctx.values.location = forecast.location;
      ctx.values.forecast = `${forecast.summary}, ${forecast.tempC}°C`;
      break;
    }
    case "reset": {
      resetState();
      break;
    }
  }
}

// ---- entrance: agents walk in from the edges and meet ---------------------
async function playEntrance(): Promise<void> {
  speakerName.textContent = "";
  dialogueText.textContent = "…";
  choicesEl.innerHTML = "";

  if (reducedMotion) {
    buyoActor.stopWalk();
    sellaActor.stopWalk();
    buyoFig.style.transform = "";
    sellaFig.style.transform = "";
    return;
  }

  // Start each actor just past its edge of the viewport, then walk to rest.
  const bRect = buyoFig.getBoundingClientRect();
  const sRect = sellaFig.getBoundingClientRect();
  const offB = bRect.right + 32;
  const offS = window.innerWidth - sRect.left + 32;
  buyoFig.style.transform = `translateX(${-offB}px)`;
  sellaFig.style.transform = `translateX(${offS}px)`;

  buyoActor.startWalk(150);
  sellaActor.startWalk(150);

  const opts: KeyframeAnimationOptions = { duration: 1500, easing: "steps(15, end)", fill: "forwards" };
  const aB = buyoFig.animate(
    [{ transform: `translateX(${-offB}px)` }, { transform: "translateX(0px)" }],
    opts,
  );
  const aS = sellaFig.animate(
    [{ transform: `translateX(${offS}px)` }, { transform: "translateX(0px)" }],
    opts,
  );
  await Promise.all([aB.finished, aS.finished]);

  // Cancel so the forwards-fill stops overriding the CSS transform (used by the
  // active-speaker highlight); the actors rest at their natural position.
  aB.cancel();
  aS.cancel();
  buyoActor.stopWalk();
  sellaActor.stopWalk();
  buyoFig.style.transform = "";
  sellaFig.style.transform = "";
}

// ---- rendering ------------------------------------------------------------
function setActiveSpeaker(speaker: Speaker): void {
  buyoFig.classList.toggle("is-active", speaker === "buyo");
  sellaFig.classList.toggle("is-active", speaker === "sella");
  dialogueBox.classList.remove("from-left", "from-right", "from-center");
  dialogueBox.classList.add(
    speaker === "buyo" ? "from-left" : speaker === "sella" ? "from-right" : "from-center",
  );
}

function renderDialogue(node: SceneNode): void {
  speakerName.textContent = SPEAKER_LABEL[node.speaker];
  dialogueText.textContent = interpolate(node.text);
  setActiveSpeaker(node.speaker);
  if (!reducedMotion) {
    dialogueText.classList.remove("fade-in");
    void dialogueText.offsetWidth;
    dialogueText.classList.add("fade-in");
  }
}

function renderChoices(node: SceneNode): void {
  choicesEl.innerHTML = "";
  if (!node.choices) return;
  for (const choice of node.choices) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "choice";
    btn.textContent = choice.label;
    btn.addEventListener("click", () => void goTo(choice.goto));
    choicesEl.appendChild(btn);
  }
}

function showWorking(label: string): void {
  choicesEl.innerHTML = `<p class="choices__working">${label}</p>`;
}

function workingLabel(action: ActionKey): string {
  switch (action) {
    case "fetch402":
      return "Requesting the resource… (expecting a 402)";
    case "buildAuth":
      return "Constructing the EIP-712 authorization…";
    case "settle":
      return "Settling on Base… (simulated)";
    default:
      return "Working…";
  }
}

// ---- navigation -----------------------------------------------------------
let busy = false;

async function goTo(id: string): Promise<void> {
  if (busy) return;

  if (id === "__explain") {
    openExplainer();
    return;
  }
  if (id === "__restart") {
    await restart();
    return;
  }

  const node = SCRIPT[id];
  if (!node) throw new Error(`Unknown node: ${id}`);

  busy = true;
  renderDialogue(node);

  if (node.action) {
    showWorking(workingLabel(node.action));
    try {
      await runAction(node.action);
    } catch (err) {
      choicesEl.innerHTML = `<p class="choices__working">Something went wrong: ${
        (err as Error).message
      }</p>`;
      busy = false;
      return;
    }
  }

  // Beat 4: the Ledger Stax review + hold-to-sign.
  if (node.approval) {
    showWorking("Review on the Ledger Stax, then hold to sign.");
    busy = false; // the device UI drives now
    const outcome = await runStaxReview({
      amountHuman: ctx.values.price ?? ctx.terms?.amountHuman ?? "",
      recipientName: "Sella",
      recipientAddr: ctx.values.payTo ?? ctx.terms?.payToDisplay ?? "",
      networkLabel: ctx.values.network ?? "Base",
      reducedMotion,
    });

    if (outcome === "rejected") {
      setIdle("cancelled");
      await goTo(node.onReject ?? START_NODE);
      return;
    }

    setIdle("signed");
    const signed = await signAuthorization(ctx.typedData!);
    ctx.signed = signed;
    ctx.values.sigShort = shortHex(signed.signature, 10, 6);
    await goTo(node.goto!);
    return;
  }

  if (node.choices) {
    renderChoices(node);
    busy = false;
    return;
  }

  if (node.goto) {
    busy = false;
    await sleep(reducedMotion ? 120 : 650);
    await goTo(node.goto);
    return;
  }

  busy = false;
}

// ---- explainer + restart --------------------------------------------------
function openExplainer(): void {
  const panel = el("explainPanel");
  panel.removeAttribute("hidden");
  el<HTMLButtonElement>("explainClose").focus();
  panel.scrollIntoView({ behavior: reducedMotion ? "auto" : "smooth", block: "nearest" });
}

function resetState(): void {
  ctx.terms = undefined;
  ctx.typedData = undefined;
  ctx.signed = undefined;
  ctx.settlement = undefined;
  ctx.forecast = undefined;
  const wrapLine = ctx.values.wrapLine;
  ctx.values = {};
  if (wrapLine) ctx.values.wrapLine = wrapLine;
  setIdle("ready");
  el("explainPanel").setAttribute("hidden", "");
}

async function restart(): Promise<void> {
  busy = true;
  resetState();
  await playEntrance();
  busy = false;
  await goTo(START_NODE);
}

// ---- honesty: wrap line + tag adapt to the signer mode --------------------
function applyHonestyCopy(config: Config): void {
  const wrapLine = config.useRealSigner
    ? "Paid with x402. Signed on a real Ledger emulator. Key never left the device."
    : "Paid with x402. Signed in a simulated Ledger flow. Key never left the device.";
  ctx.values.wrapLine = wrapLine;
  el("verdict").textContent = wrapLine;

  el("simTag").textContent = config.useRealSigner
    ? "Real EIP-712 signature on the Ledger Speculos emulator. Settlement is simulated. No real funds."
    : "Simulated EIP-712 signature for now. Real Ledger Speculos signing arrives in a later phase. Settlement is simulated. No real funds.";
}

// ---- bootstrap ------------------------------------------------------------
export async function startEngine(): Promise<void> {
  dialogueBox = el("dialogue");
  speakerName = el("speakerName");
  dialogueText = el("dialogueText");
  choicesEl = el("choices");
  buyoFig = el("buyo");
  sellaFig = el("sella");

  buyoActor = new SpriteActor(el("buyoSprite"), "buyo");
  sellaActor = new SpriteActor(el("sellaSprite"), "sella");

  // Draw the Ledger mark onto the Stax bottom bar.
  const markHost = document.getElementById("ledgerMark");
  if (markHost) markHost.appendChild(createSpriteCanvas(SPRITES.ledgerMark));

  initLedger();

  el<HTMLButtonElement>("explainClose").addEventListener("click", () =>
    el("explainPanel").setAttribute("hidden", ""),
  );

  // Walk the agents in first (no await before this, so they never flash at rest).
  await playEntrance();

  // Then load config and set the honest wrap line / tag (used much later).
  ctx.config = await fetchConfig();
  applyHonestyCopy(ctx.config);

  await goTo(START_NODE);
}
