// The "Clear Signing" card: a clean, readable review of exactly what is being
// signed, the way Ledger's clear signing is meant to work. It lists the
// human-readable fields pulled from the real EIP-712 transferWithAuthorization,
// then a press-and-hold "Hold to sign" confirmation (or a single tap under
// prefers-reduced-motion) plus a "Reject" option. No device shape is drawn.
//
// Signing itself happens after this resolves (simulated in this build).

export interface SignData {
  action: string; // "Sign payment authorization (x402)"
  amount: string; // "0.01 USDC"
  toName: string; // "Sella"
  toAddr: string; // short fake address
  network: string; // "Base"
  nonce: string; // short
  validUntil: string; // clock time
  reducedMotion: boolean;
}

export type SignOutcome = "approved" | "rejected";

const HOLD_MS = 900;
const BAR_STEPS = 16;

let cardEl: HTMLElement;
let lastData: SignData | null = null;
let realMode = false;

export function initClearSign(): void {
  cardEl = document.getElementById("signCard") as HTMLElement;
  setCardState("idle");
}

/** Tell the card whether signing is real (Speculos) or simulated, so the signed
 *  state stays honest. */
export function setSignerMode(real: boolean): void {
  realMode = real;
}

const esc = (s: string) =>
  s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

function fieldsHtml(d: SignData): string {
  return `
    <dl class="cs__fields">
      <div class="cs__row"><dt>Action</dt><dd>${esc(d.action)}</dd></div>
      <div class="cs__row cs__row--amount"><dt>Amount</dt><dd>${esc(d.amount)}</dd></div>
      <div class="cs__row"><dt>To</dt><dd>${esc(d.toName)} <span class="cs__addr">${esc(d.toAddr)}</span></dd></div>
      <div class="cs__row"><dt>Network</dt><dd>${esc(d.network)}</dd></div>
      <div class="cs__row cs__row--small"><dt>Nonce</dt><dd>${esc(d.nonce)}</dd></div>
      <div class="cs__row cs__row--small"><dt>Valid until</dt><dd>${esc(d.validUntil)}</dd></div>
    </dl>`;
}

/** Idle / terminal states of the card. */
export function setCardState(
  state: "idle" | "signed" | "cancelled" | "error",
  detail?: string,
  signerShort?: string,
): void {
  if (state === "error") {
    cardEl.innerHTML = `
      <div class="cs">
        <span class="cs__badge cs__badge--bad">SIGNER UNAVAILABLE</span>
        <p class="cs__idle">${esc(detail ?? "Could not reach the Ledger signer.")}</p>
      </div>`;
    return;
  }
  if (state === "idle") {
    cardEl.innerHTML = `
      <div class="cs cs--idle">
        <p class="cs__idle">No payment to review yet. Play through the demo and the
        authorization will appear here for you to check and sign.</p>
      </div>`;
    return;
  }
  if (state === "cancelled") {
    cardEl.innerHTML = `
      <div class="cs">
        <span class="cs__badge cs__badge--bad">PAYMENT CANCELLED</span>
        <p class="cs__idle">You rejected it on review. Nothing was signed and nothing moved.</p>
      </div>`;
    return;
  }
  // signed
  const d = lastData;
  const badge = realMode ? "SIGNED ON LEDGER" : "SIGNED (SIMULATED)";
  const note = realMode
    ? "Real EIP-712 x402 authorization, signed on a Ledger (Speculos) device. The key never left the device. Settlement is simulated and no real funds move."
    : "The key never left the device. Settlement is simulated.";
  const signedBy =
    realMode && signerShort
      ? `<div class="cs__sig">Signed by <code>${esc(signerShort)}</code></div>`
      : "";
  cardEl.innerHTML = `
    <div class="cs">
      <span class="cs__badge cs__badge--good">${badge}</span>
      ${d ? fieldsHtml(d) : ""}
      <div class="cs__sig">Signature <code>${esc(detail ?? "")}</code></div>
      ${signedBy}
      <p class="cs__note">${note}</p>
    </div>`;
}

// --- a small coin-clink on a completed signature ---------------------------
let audio: AudioContext | null = null;
function clink(reduced: boolean): void {
  if (reduced) return;
  try {
    const Ctor =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    audio = audio || new Ctor();
    const c = audio;
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

/** Render the review + hold-to-sign. Resolves with the user's decision. */
export function runClearSign(data: SignData): Promise<SignOutcome> {
  lastData = data;
  return new Promise<SignOutcome>((resolve) => {
    let holdRaf = 0;
    let holdStart = 0;
    let resolved = false;

    function finish(outcome: SignOutcome) {
      if (resolved) return;
      resolved = true;
      cancelAnimationFrame(holdRaf);
      if (outcome === "approved") clink(data.reducedMotion);
      resolve(outcome);
    }

    const confirm = data.reducedMotion
      ? `<button class="cs__sign cs__sign--tap" data-act="sign">Tap to sign</button>`
      : `<button class="cs__sign" data-act="hold">
           <span class="cs__bar"><span class="cs__fill" id="csFill"></span></span>
           <span class="cs__sign-label">Hold to sign</span>
         </button>`;

    cardEl.innerHTML = `
      <div class="cs">
        <p class="cs__lead">Review exactly what you sign.</p>
        ${fieldsHtml(data)}
        <div class="cs__actions">
          <button class="cs__reject" data-act="reject">Reject</button>
          ${confirm}
        </div>
      </div>`;

    const setFill = (ratio: number) => {
      const fill = document.getElementById("csFill");
      if (!fill) return;
      const stepped = Math.round(ratio * BAR_STEPS) / BAR_STEPS;
      fill.style.width = `${Math.min(stepped, 1) * 100}%`;
    };
    const startHold = () => {
      holdStart = performance.now();
      const tick = () => {
        const ratio = (performance.now() - holdStart) / HOLD_MS;
        setFill(ratio);
        if (ratio >= 1) return finish("approved");
        holdRaf = requestAnimationFrame(tick);
      };
      holdRaf = requestAnimationFrame(tick);
    };
    const cancelHold = () => {
      cancelAnimationFrame(holdRaf);
      setFill(0);
    };

    cardEl.querySelectorAll<HTMLElement>("[data-act]").forEach((node) => {
      const act = node.dataset.act;
      if (act === "reject") node.onclick = () => finish("rejected");
      if (act === "sign") node.onclick = () => finish("approved");
      if (act === "hold") {
        node.onpointerdown = (e) => {
          e.preventDefault();
          startHold();
        };
        node.onpointerup = cancelHold;
        node.onpointerleave = cancelHold;
        node.onpointercancel = cancelHold;
      }
    });
  });
}
