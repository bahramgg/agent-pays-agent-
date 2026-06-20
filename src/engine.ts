// The cartoon engine. Interprets the scene script (scene.ts), renders dialogue
// and choices, runs the x402 actions (payment.ts), and handles the Ledger Nano
// button-press approval. Honest by construction: the on-screen wrap line and
// honesty tag adapt to whether the signature is simulated or real.

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

// ---- live state -----------------------------------------------------------
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
let ledgerEl: HTMLElement;
let ledgerScreen: HTMLElement;
let approveBtn: HTMLButtonElement;
let rejectBtn: HTMLButtonElement;

const SPEAKER_LABEL: Record<Speaker, string> = {
  buyo: "Buyo",
  sella: "Sella",
  narrator: "Narrator",
  ledger: "Ledger Nano",
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const cap = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

function interpolate(text: string): string {
  return text.replace(/\{(\w+)\}/g, (_, k) => ctx.values[k] ?? "");
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
      ctx.values.expiry = new Date(Number(terms.validBefore) * 1000).toLocaleTimeString(
        [],
        { hour: "2-digit", minute: "2-digit" },
      );
      break;
    }
    case "buildAuth": {
      if (!ctx.terms) throw new Error("no terms");
      ctx.typedData = buildAuthorization(ctx.terms);
      break;
    }
    case "prepareScreen": {
      loadLedgerScreen();
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

// ---- Ledger Nano ----------------------------------------------------------
function loadLedgerScreen(): void {
  const t = ctx.terms;
  if (!t) return;
  const lines = [
    "REVIEW & APPROVE",
    `Transfer ${t.amountHuman}`,
    `To ${t.payToDisplay}`,
    `Network ${cap(t.network)}`,
    `Nonce ${shortHex(t.nonce, 6, 4)}`,
  ];
  ledgerScreen.innerHTML = "";
  for (const line of lines) {
    const div = document.createElement("div");
    div.className = "ledger__line";
    div.textContent = line;
    ledgerScreen.appendChild(div);
  }
  ledgerEl.classList.add("is-lit");
}

function clearLedgerScreen(): void {
  ledgerScreen.innerHTML = '<div class="ledger__line">READY</div>';
  ledgerEl.classList.remove("is-lit", "is-active", "is-signing");
}

let clinkCtx: AudioContext | null = null;
function playClink(): void {
  if (reducedMotion) return;
  try {
    const Ctor =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    clinkCtx = clinkCtx || new Ctor();
    const c = clinkCtx;
    void c.resume();
    [
      { f: 880, t: 0, d: 0.07 },
      { f: 1320, t: 0.06, d: 0.11 },
    ].forEach(({ f, t, d }) => {
      const osc = c.createOscillator();
      const gain = c.createGain();
      osc.type = "square";
      osc.frequency.value = f;
      gain.gain.setValueAtTime(0.0001, c.currentTime + t);
      gain.gain.exponentialRampToValueAtTime(0.1, c.currentTime + t + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + t + d);
      osc.connect(gain).connect(c.destination);
      osc.start(c.currentTime + t);
      osc.stop(c.currentTime + t + d + 0.02);
    });
  } catch {
    /* audio is a nicety */
  }
}

/** Beat 4: enable the buttons and resolve when the user approves. */
function waitForApproval(): Promise<void> {
  ledgerEl.classList.add("is-active");
  approveBtn.disabled = false;
  rejectBtn.disabled = false;

  return new Promise<void>((resolve) => {
    const onApprove = async () => {
      cleanup();
      approveBtn.classList.add("is-pressed");
      ledgerEl.classList.add("is-signing");
      playClink();
      await sleep(reducedMotion ? 60 : 420);
      ledgerEl.classList.remove("is-signing");
      approveBtn.classList.remove("is-pressed");

      // Sign now (simulated server-side; Ledger Speculos in Phase 4).
      if (!ctx.typedData) throw new Error("no typedData to sign");
      const signed = await signAuthorization(ctx.typedData);
      ctx.signed = signed;
      ctx.values.sigShort = shortHex(signed.signature, 10, 6);
      ledgerScreen.innerHTML = '<div class="ledger__line">APPROVED ✓</div>';
      resolve();
    };
    const onReject = () => {
      // Gentle nudge; the demo path needs an approval to continue.
      const hint = ledgerScreen.querySelector(".ledger__hint");
      if (!hint) {
        const h = document.createElement("div");
        h.className = "ledger__line ledger__hint";
        h.textContent = "Press the right button to approve.";
        ledgerScreen.appendChild(h);
      }
    };
    function cleanup() {
      approveBtn.disabled = true;
      rejectBtn.disabled = true;
      approveBtn.removeEventListener("click", onApprove);
      rejectBtn.removeEventListener("click", onReject);
    }
    approveBtn.addEventListener("click", onApprove);
    rejectBtn.addEventListener("click", onReject);
  });
}

// ---- rendering ------------------------------------------------------------
function setActiveSpeaker(speaker: Speaker): void {
  el("buyo").classList.toggle("is-active", speaker === "buyo");
  el("sella").classList.toggle("is-active", speaker === "sella");
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
    void dialogueText.offsetWidth; // restart the animation
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
    btn.addEventListener("click", () => {
      void goTo(choice.goto);
    });
    choicesEl.appendChild(btn);
  }
}

function showWorking(label: string): void {
  choicesEl.innerHTML = `<p class="choices__working">${label}</p>`;
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
    await runAction("reset");
    id = START_NODE;
  }

  const node = SCRIPT[id];
  if (!node) throw new Error(`Unknown node: ${id}`);

  busy = true;
  renderDialogue(node);

  // Run the node's side effect (real 402, build auth, settle, ...).
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

  // Beat 4: physical approval, then sign, then continue.
  if (node.approval) {
    showWorking("Awaiting your approval on the Ledger Nano…");
    busy = false; // allow the button handlers to drive
    await waitForApproval();
    busy = true;
    if (node.goto) {
      busy = false;
      await goTo(node.goto);
      return;
    }
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

// ---- explainer + reset ----------------------------------------------------
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
  clearLedgerScreen();
  el("explainPanel").setAttribute("hidden", "");
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
  ledgerEl = el("ledger");
  ledgerScreen = el("ledgerScreen");
  approveBtn = el<HTMLButtonElement>("ledgerApprove");
  rejectBtn = el<HTMLButtonElement>("ledgerReject");

  approveBtn.disabled = true;
  rejectBtn.disabled = true;
  clearLedgerScreen();

  el<HTMLButtonElement>("explainClose").addEventListener("click", () => {
    el("explainPanel").setAttribute("hidden", "");
  });

  ctx.config = await fetchConfig();
  applyHonestyCopy(ctx.config);

  await goTo(START_NODE);
}
