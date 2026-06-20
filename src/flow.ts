// The animated x402 exchange flow.
// A small async state machine steps through six beats, each with a one-line
// caption. Motion is intentionally stepped (8-bit feel) via the Web Animations
// API with steps() easing. Respects prefers-reduced-motion with a calm version.
//
// IMPORTANT: every value here is FAKE. No real funds, no real network.

import { createSpriteCanvas, type SpriteName } from "./sprites.js";

/** Clearly-fake, realistic-looking values used throughout the flow. */
export const FAKE = {
  amount: "0.01 USDC",
  network: "Base",
  agentA: "0x5FbA...9c3D",
  agentB: "0x7E1f...A2c0",
  nonce: "0x9f2c4e...01",
  signature: "0x3b1a...e7d4",
  txHash: "0xBA5E...10cc",
  settleTime: "~2s",
};

const reducedMotion = window.matchMedia(
  "(prefers-reduced-motion: reduce)",
).matches;

// Beat timings (ms). Reduced motion collapses movement and uses calm dwells.
const T = reducedMotion
  ? { move: 1, dwell: 750, beat: 300 }
  : { move: 750, dwell: 950, beat: 350 };

// ---- DOM lookups ----------------------------------------------------------
function el<T extends HTMLElement = HTMLElement>(id: string): T {
  const node = document.getElementById(id);
  if (!node) throw new Error(`Missing #${id}`);
  return node as T;
}

let scene: HTMLElement;
let tokenLayer: HTMLElement;
let caption: HTMLElement;
let runBtn: HTMLButtonElement;

// ---- small helpers --------------------------------------------------------
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function setCaption(text: string): void {
  caption.textContent = text;
}

/** Center of an element relative to the scene container. */
function centerIn(target: HTMLElement): { x: number; y: number } {
  const s = scene.getBoundingClientRect();
  const r = target.getBoundingClientRect();
  return {
    x: r.left + r.width / 2 - s.left,
    y: r.top + r.height / 2 - s.top,
  };
}

/** Spawn a moving sprite token into the token layer. */
function spawnToken(name: SpriteName, label?: string): HTMLElement {
  const token = document.createElement("div");
  token.className = "token";
  token.appendChild(createSpriteCanvas(name));
  if (label) {
    const tag = document.createElement("span");
    tag.className = "token__label";
    tag.textContent = label;
    token.appendChild(tag);
  }
  tokenLayer.appendChild(token);
  return token;
}

function placeAt(token: HTMLElement, point: { x: number; y: number }): void {
  token.style.left = `${point.x - token.offsetWidth / 2}px`;
  token.style.top = `${point.y - token.offsetHeight / 2}px`;
}

/** Animate a token from one actor to another with stepped, 8-bit motion. */
async function moveToken(
  token: HTMLElement,
  fromEl: HTMLElement,
  toEl: HTMLElement,
): Promise<void> {
  const from = centerIn(fromEl);
  const to = centerIn(toEl);
  placeAt(token, from);
  token.style.opacity = "1";

  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const steps = reducedMotion ? 1 : 8;

  await token.animate(
    [
      { transform: "translate(0px, 0px)" },
      { transform: `translate(${dx}px, ${dy}px)` },
    ],
    { duration: T.move, easing: `steps(${steps}, end)`, fill: "forwards" },
  ).finished;
}

function removeToken(token: HTMLElement): void {
  token.remove();
}

// ---- audio: a tiny coin-clink on the hardware stamp -----------------------
let audioCtx: AudioContext | null = null;

function playClink(): void {
  if (reducedMotion) return;
  try {
    if (!audioCtx) {
      const Ctor =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext;
      audioCtx = new Ctor();
    }
    const ctx = audioCtx;
    void ctx.resume();
    // Two quick square blips: a satisfying retro "clink".
    [
      { f: 880, t: 0, d: 0.08 },
      { f: 1320, t: 0.07, d: 0.12 },
    ].forEach(({ f, t, d }) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "square";
      osc.frequency.value = f;
      gain.gain.setValueAtTime(0.0001, ctx.currentTime + t);
      gain.gain.exponentialRampToValueAtTime(0.12, ctx.currentTime + t + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + t + d);
      osc.connect(gain).connect(ctx.destination);
      osc.start(ctx.currentTime + t);
      osc.stop(ctx.currentTime + t + d + 0.02);
    });
  } catch {
    /* audio is a nicety; ignore if unsupported */
  }
}

// ---- ledger screen --------------------------------------------------------
function setScreen(text: string, lit: boolean): void {
  const screen = el("ledgerScreen");
  el("ledgerScreenText").textContent = text;
  screen.classList.toggle("is-lit", lit);
}

// ---- reset ----------------------------------------------------------------
function resetScene(): void {
  tokenLayer.innerHTML = "";
  setScreen("READY", false);
  el("ledger").classList.remove("is-signing");
  el("ledgerStamp").hidden = true;
  el("facilitator").classList.remove("is-active");
  el("facilitatorStatus").textContent = "";
  const settled = document.getElementById("settledBlock");
  if (settled) settled.remove();
}

// ---- the six beats --------------------------------------------------------
async function runExchange(): Promise<void> {
  resetScene();

  const agentAEl = el("agentA");
  const agentBEl = el("agentB");
  const ledgerEl = el("ledger");
  const facilitatorEl = el("facilitator");

  // Beat 1 — Request
  setCaption("1. Request: Agent A asks Agent B for the Weather Oracle (GET /weather).");
  {
    const pkt = spawnToken("request", "GET /weather");
    await moveToken(pkt, agentAEl, agentBEl);
    await sleep(T.beat);
    removeToken(pkt);
  }

  // Beat 2 — 402 Payment Required
  setCaption(`2. 402 Payment Required: Agent B replies with a price of ${FAKE.amount} on ${FAKE.network}.`);
  {
    const bubble = spawnToken("coin", `402 - ${FAKE.amount}`);
    await moveToken(bubble, agentBEl, agentAEl);
    await sleep(T.dwell);
    removeToken(bubble);
  }

  // Beat 3 — Build authorization (EIP-3009 transferWithAuthorization, EIP-712)
  setCaption("3. Authorize: Agent A builds an EIP-3009 transferWithAuthorization (EIP-712 typed data).");
  {
    const tkt = spawnToken("ticket", "transferWithAuthorization");
    placeAt(tkt, centerIn(agentAEl));
    tkt.style.opacity = "1";
    tkt.classList.add("token--pop");
    await sleep(T.dwell);

    // Beat 4 — HARDWARE GATE (the star): authorization travels DOWN to Ledger
    setCaption("4. Hardware gate: the authorization goes to the Ledger. The key never leaves the device.");
    await moveToken(tkt, agentAEl, ledgerEl);
    setScreen(`SIGN PAYMENT? ${FAKE.amount} -> Agent B`, true);
    await sleep(T.dwell);

    // physical button press: stamp it
    ledgerEl.classList.add("is-signing");
    playClink();
    await sleep(reducedMotion ? T.beat : 450);
    setScreen("SIGNED", true);
    const stamp = el("ledgerStamp");
    stamp.hidden = false;
    ledgerEl.classList.remove("is-signing");
    setCaption(`Signed on hardware. Signature ${FAKE.signature}. Nonce ${FAKE.nonce}.`);
    await sleep(T.dwell);
    removeToken(tkt);
  }

  // Beat 5 — Settle on Base via facilitator
  setCaption(`5. Settle: the facilitator settles on ${FAKE.network}. Settled in ${FAKE.settleTime}.`);
  {
    const signed = spawnToken("ticket", "signed auth");
    await moveToken(signed, ledgerEl, facilitatorEl);
    facilitatorEl.classList.add("is-active");
    await sleep(T.beat);
    removeToken(signed);

    // a pixel BLOCK / checkmark appears
    const blockBox = document.createElement("div");
    blockBox.id = "settledBlock";
    blockBox.className = "settled-block token--pop";
    blockBox.appendChild(createSpriteCanvas("block"));
    facilitatorEl.appendChild(blockBox);
    el("facilitatorStatus").textContent = `BLOCK OK - tx ${FAKE.txHash}`;
    await sleep(T.dwell);
  }

  // Beat 6 — Deliver
  setCaption("6. Deliver: Agent B sends the weather back to Agent A. The paid request is complete.");
  {
    const out = spawnToken("data", "200 OK");
    await moveToken(out, agentBEl, agentAEl);
    await sleep(T.dwell);
    removeToken(out);
  }

  setCaption("Done. Paid with x402, signed on hardware. Try WHAT JUST HAPPENED? for the plain-language version.");
}

// ---- wiring ---------------------------------------------------------------
let running = false;

async function onRun(): Promise<void> {
  if (running) return;
  running = true;
  runBtn.disabled = true;
  runBtn.textContent = "RUNNING...";
  try {
    await runExchange();
  } finally {
    running = false;
    runBtn.disabled = false;
    runBtn.textContent = "RUN AGAIN";
  }
}

function setupExplainToggle(): void {
  const btn = el<HTMLButtonElement>("explainBtn");
  const panel = el("explainPanel");
  btn.addEventListener("click", () => {
    const open = panel.hasAttribute("hidden");
    if (open) {
      panel.removeAttribute("hidden");
    } else {
      panel.setAttribute("hidden", "");
    }
    btn.setAttribute("aria-expanded", String(open));
    if (open) panel.scrollIntoView({ behavior: "smooth", block: "nearest" });
  });
}

export function setupFlow(): void {
  scene = el("scene");
  tokenLayer = el("tokens");
  caption = el("caption");
  runBtn = el<HTMLButtonElement>("runBtn");

  setScreen("READY", false);
  runBtn.addEventListener("click", onRun);
  setupExplainToggle();
}
