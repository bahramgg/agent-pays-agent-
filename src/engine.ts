// The cartoon engine. Plays the walk-in entrance, interprets the scene script
// (scene.ts), renders dialogue, choices, and an always-visible status step,
// runs the x402 actions (payment.ts), and hands the payment to the clear-signing
// card (clearsign.ts). It also drives the Demo / How it works / About / ? tabs.
// Honest by construction: the wrap line and honesty tag adapt to the signer mode.

import { SpriteActor } from "./actors.js";
import { initClearSign, runClearSign, setCardState, setSignerMode } from "./clearsign.js";
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

function el<T extends HTMLElement = HTMLElement>(id: string): T {
  const node = document.getElementById(id);
  if (!node) throw new Error(`Missing #${id}`);
  return node as T;
}

let sceneEl: HTMLElement;
let dialogueBox: HTMLElement;
let speakerName: HTMLElement;
let dialogueText: HTMLElement;
let choicesEl: HTMLElement;
let signPanel: HTMLElement;
let buyoFig: HTMLElement;
let sellaFig: HTMLElement;
let buyoActor: SpriteActor;
let sellaActor: SpriteActor;

const SPEAKER_LABEL: Record<Speaker, string> = {
  buyo: "Buyo",
  sella: "Sella",
  narrator: "Narrator",
  system: "Clear signing",
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const cap = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);
const interpolate = (text: string) => text.replace(/\{(\w+)\}/g, (_, k) => ctx.values[k] ?? "");

// ---- bottom accordion -----------------------------------------------------
function openHowItWorks(): void {
  const item = document.getElementById("accHow");
  if (item instanceof HTMLDetailsElement) {
    item.open = true;
    item.scrollIntoView({ behavior: reducedMotion ? "auto" : "smooth", block: "start" });
  }
}

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

// ---- entrance -------------------------------------------------------------
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

  const sceneRect = sceneEl.getBoundingClientRect();
  const bRect = buyoFig.getBoundingClientRect();
  const sRect = sellaFig.getBoundingClientRect();
  const offB = bRect.right - sceneRect.left + 16;
  const offS = sceneRect.right - sRect.left + 16;
  buyoFig.style.transform = `translateX(${-offB}px)`;
  sellaFig.style.transform = `translateX(${offS}px)`;

  buyoActor.startWalk(150);
  sellaActor.startWalk(150);

  const opts: KeyframeAnimationOptions = { duration: 1500, easing: "steps(15, end)", fill: "forwards" };
  const aB = buyoFig.animate([{ transform: `translateX(${-offB}px)` }, { transform: "translateX(0px)" }], opts);
  const aS = sellaFig.animate([{ transform: `translateX(${offS}px)` }, { transform: "translateX(0px)" }], opts);
  await Promise.all([aB.finished, aS.finished]);

  aB.cancel();
  aS.cancel();
  buyoActor.stopWalk();
  sellaActor.stopWalk();
  buyoFig.style.transform = "";
  sellaFig.style.transform = "";
}

// ---- rendering ------------------------------------------------------------
let currentSpeaker: Speaker = "narrator";

/** Point the dialogue tail at the active speaker, measured live so it stays
 *  aligned across screen sizes. Narrator/system center it. */
function positionTail(): void {
  const dRect = dialogueBox.getBoundingClientRect();
  if (dRect.width === 0) return;
  let centerX: number;
  if (currentSpeaker === "buyo" || currentSpeaker === "sella") {
    const fig = currentSpeaker === "buyo" ? buyoFig : sellaFig;
    const r = fig.getBoundingClientRect();
    centerX = r.left + r.width / 2 - dRect.left;
  } else {
    centerX = dRect.width / 2;
  }
  const margin = 18;
  centerX = Math.max(margin, Math.min(dRect.width - margin, centerX));
  dialogueBox.style.setProperty("--tail-x", `${Math.round(centerX)}px`);
}

function setActiveSpeaker(speaker: Speaker): void {
  currentSpeaker = speaker;
  buyoFig.classList.toggle("is-active", speaker === "buyo");
  sellaFig.classList.toggle("is-active", speaker === "sella");
  positionTail();
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

/** Friendly recovery when the (real) Ledger signer cannot be reached. */
function showSignerError(): void {
  signPanel.classList.remove("is-foreground");
  speakerName.textContent = SPEAKER_LABEL.system;
  dialogueText.textContent =
    "The Ledger signer could not be reached. Make sure Speculos is running, then try again.";
  setActiveSpeaker("system");
  choicesEl.innerHTML = "";
  const mk = (label: string, goto: string) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "choice";
    btn.textContent = label;
    btn.addEventListener("click", () => void goTo(goto));
    choicesEl.appendChild(btn);
  };
  mk("Try again", "confirm");
  mk("Start over", "__restart");
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
    openHowItWorks();
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

  // Review and sign on the clear-signing card.
  if (node.approval) {
    showWorking("Review the clear-signing card, then hold to sign.");
    signPanel.classList.add("is-foreground");
    signPanel.scrollIntoView({ behavior: reducedMotion ? "auto" : "smooth", block: "center" });
    busy = false; // the card drives now

    const outcome = await runClearSign({
      action: "Sign payment authorization (x402)",
      amount: ctx.values.price ?? ctx.terms?.amountHuman ?? "",
      toName: "Sella",
      toAddr: ctx.values.payTo ?? ctx.terms?.payToDisplay ?? "",
      network: ctx.values.network ?? "Base",
      nonce: ctx.values.nonce ?? "",
      validUntil: ctx.values.expiry ?? "",
      reducedMotion,
    });

    signPanel.classList.remove("is-foreground");
    if (outcome === "rejected") {
      setCardState("cancelled");
      await goTo(node.onReject ?? START_NODE);
      return;
    }

    // Real mode goes to a device: show that the transaction was sent for signing
    // and that the player must approve it on their Ledger (Speculos).
    if (ctx.config.useRealSigner) {
      setCardState("pending");
      speakerName.textContent = SPEAKER_LABEL.system;
      dialogueText.textContent =
        "Transaction sent to the Ledger for signing. Approve it on your device now.";
      setActiveSpeaker("system");
      showWorking("Waiting for you to approve on the Ledger device…");
    }

    let signed;
    try {
      signed = await signAuthorization(ctx.typedData!);
    } catch (err) {
      // Real mode only: Speculos unreachable or the device action failed. Show a
      // friendly message and let the player retry. Never fake a signature.
      const detail = (err as Error).message || "The Ledger signer could not be reached.";
      setCardState("error", detail);
      showSignerError();
      busy = false;
      return;
    }
    ctx.signed = signed;
    // Real mode returns the exact authorization the device signed (from = the
    // Ledger address). Use it for settlement and display so everything is honest.
    if (signed.authorization && ctx.typedData) {
      ctx.typedData = { ...ctx.typedData, message: signed.authorization };
    }
    ctx.values.sigShort = shortHex(signed.signature, 10, 6);
    const signerShort = signed.signer ? shortHex(signed.signer, 6, 4) : undefined;
    setCardState("signed", ctx.values.sigShort, signerShort);
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

// ---- restart --------------------------------------------------------------
function resetState(): void {
  ctx.terms = undefined;
  ctx.typedData = undefined;
  ctx.signed = undefined;
  ctx.settlement = undefined;
  ctx.forecast = undefined;
  const wrapLine = ctx.values.wrapLine;
  ctx.values = {};
  if (wrapLine) ctx.values.wrapLine = wrapLine;
  setCardState("idle");
}

async function restart(): Promise<void> {
  busy = true;
  resetState();
  await playEntrance();
  busy = false;
  await goTo(START_NODE);
}

// ---- honesty --------------------------------------------------------------
function applyHonestyCopy(config: Config): void {
  const wrapLine = config.useRealSigner
    ? "Paid with x402. Signed on a real Ledger emulator. Key never left the device."
    : "Paid with x402. Signed in a simulated Ledger flow. Key never left the device.";
  ctx.values.wrapLine = wrapLine;
  el("verdict").textContent = wrapLine;
  setSignerMode(config.useRealSigner);
}

// ---- bootstrap ------------------------------------------------------------
export async function startEngine(): Promise<void> {
  sceneEl = el("scene");
  dialogueBox = el("dialogue");
  speakerName = el("speakerName");
  dialogueText = el("dialogueText");
  choicesEl = el("choices");
  signPanel = el("signPanel");
  buyoFig = el("buyo");
  sellaFig = el("sella");

  buyoActor = new SpriteActor(el("buyoSprite"), "buyo");
  sellaActor = new SpriteActor(el("sellaSprite"), "sella");

  initClearSign();

  // Keep the dialogue tail pointing at the speaker as the layout changes.
  window.addEventListener("resize", positionTail);

  await playEntrance();

  ctx.config = await fetchConfig();
  applyHonestyCopy(ctx.config);

  await goTo(START_NODE);
}
