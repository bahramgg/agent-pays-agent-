// The cartoon engine. Plays the walk-in entrance, interprets the scene script
// (scene.ts), renders dialogue, choices, and an always-visible status step,
// runs the x402 actions (payment.ts), and hands the payment to the clear-signing
// card (clearsign.ts). It also drives the Demo / How it works / About / ? tabs.
// Honest by construction: the wrap line and honesty tag adapt to the signer mode.

import { SpriteActor } from "./actors.js";
import { initClearSign, runClearSign, setCardState } from "./clearsign.js";
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
import { SCRIPT, START_NODE, TOTAL_STEPS, type ActionKey, type SceneNode, type Speaker } from "./scene.js";

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
let statusLine: HTMLElement;
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

// ---- tabs -----------------------------------------------------------------
const TABS: Record<string, [string, string]> = {
  demo: ["tabDemo", "viewDemo"],
  how: ["tabHow", "viewHow"],
  about: ["tabAbout", "viewAbout"],
  help: ["tabHelp", "viewHelp"],
};
function setTab(name: string): void {
  for (const [key, [tab, view]] of Object.entries(TABS)) {
    const on = key === name;
    el(tab).classList.toggle("is-active", on);
    el(tab).setAttribute("aria-selected", String(on));
    el(view).classList.toggle("is-active", on);
    el(view).toggleAttribute("hidden", !on);
  }
}

// ---- status line ----------------------------------------------------------
function setStatus(step: number, label: string): void {
  statusLine.innerHTML = `<span class="status__step">STEP ${step} OF ${TOTAL_STEPS}</span><span class="status__label">${label}</span>`;
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
    setTab("how");
    return;
  }
  if (id === "__restart") {
    await restart();
    return;
  }

  const node = SCRIPT[id];
  if (!node) throw new Error(`Unknown node: ${id}`);

  busy = true;
  setStatus(node.step, node.status);
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

    const signed = await signAuthorization(ctx.typedData!);
    ctx.signed = signed;
    ctx.values.sigShort = shortHex(signed.signature, 10, 6);
    setCardState("signed", ctx.values.sigShort);
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
  setTab("demo");
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

  const tag = config.useRealSigner
    ? "Real EIP-712 signature on the Ledger Speculos emulator. Settlement is simulated. No real funds."
    : "Simulated EIP-712 signature for now. Real Ledger Speculos signing arrives in a later phase. Settlement is simulated. No real funds.";
  el("simTag").textContent = tag;
  const aboutTag = document.getElementById("aboutTag");
  if (aboutTag) aboutTag.textContent = tag;
}

// ---- bootstrap ------------------------------------------------------------
export async function startEngine(): Promise<void> {
  sceneEl = el("scene");
  statusLine = el("statusLine");
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

  for (const name of Object.keys(TABS)) {
    const [tab] = TABS[name];
    el<HTMLButtonElement>(tab).addEventListener("click", () => setTab(name));
  }

  await playEntrance();

  ctx.config = await fetchConfig();
  applyHonestyCopy(ctx.config);

  await goTo(START_NODE);
}
