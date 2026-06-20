// The Ledger Stax on-device flow: a real-feeling multi-page review of the
// EIP-712 payment, followed by a press-and-hold "Hold to sign" confirmation
// (or a single tap under prefers-reduced-motion). Reject cancels the payment.
//
// The screen is WHITE with BLACK text throughout, mirroring a real Stax. Values
// come from the real EIP-712 message so the review is consistent. Signing itself
// happens after this resolves (simulated in this build).

export interface ReviewData {
  amountHuman: string; // "0.01 USDC"
  recipientName: string; // "Sella"
  recipientAddr: string; // short fake address
  networkLabel: string; // "Base"
  reducedMotion: boolean;
}

export type ReviewOutcome = "approved" | "rejected";

const HOLD_MS = 900;
const BAR_STEPS = 16;

let screenEl: HTMLElement;

export function initLedger(): void {
  screenEl = document.getElementById("ledgerScreen") as HTMLElement;
  setIdle("ready");
}

/** Idle / terminal screens shown when no review is in progress. */
export function setIdle(state: "ready" | "signed" | "cancelled"): void {
  const map = {
    ready: { title: "Ledger Stax", note: "Ready" },
    signed: { title: "Approved ✓", note: "Signed on device" },
    cancelled: { title: "Cancelled", note: "Nothing was signed" },
  } as const;
  const { title, note } = map[state];
  screenEl.innerHTML = `
    <div class="stax-idle">
      <div class="stax-idle__title">${title}</div>
      <div class="stax-idle__note">${note}</div>
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

interface Page {
  label: string;
  value: string;
  sub?: string;
  icon: string; // a simple text glyph
  final?: boolean;
}

/** Run the paged review + hold-to-sign. Resolves with the user's decision. */
export function runStaxReview(data: ReviewData): Promise<ReviewOutcome> {
  const pages: Page[] = [
    { label: "Review payment", value: data.amountHuman, icon: "↓" },
    { label: "To", value: data.recipientName, sub: data.recipientAddr, icon: "→" },
    { label: "Network", value: data.networkLabel, icon: "◆", final: true },
  ];

  return new Promise<ReviewOutcome>((resolve) => {
    let page = 0;
    let holdRaf = 0;
    let holdStart = 0;
    let resolved = false;

    function finish(outcome: ReviewOutcome) {
      if (resolved) return;
      resolved = true;
      cancelAnimationFrame(holdRaf);
      if (outcome === "approved") clink(data.reducedMotion);
      resolve(outcome);
    }

    function render() {
      const p = pages[page];
      const total = pages.length;
      const controls = p.final
        ? data.reducedMotion
          ? `<button class="stax-sign stax-sign--tap" data-act="sign">✓ Tap to sign</button>`
          : `<button class="stax-sign" data-act="hold">
               <span class="stax-sign__bar"><span class="stax-sign__fill" id="staxFill"></span></span>
               <span class="stax-sign__label">✓ Hold to sign</span>
             </button>`
        : `<button class="stax-arrow stax-arrow--next" data-act="next" aria-label="Next">›</button>`;

      const prev =
        page > 0
          ? `<button class="stax-arrow stax-arrow--prev" data-act="prev" aria-label="Previous">‹</button>`
          : `<span class="stax-arrow stax-arrow--ghost" aria-hidden="true"></span>`;

      screenEl.innerHTML = `
        <div class="stax-review">
          <div class="stax-review__indicator">${page + 1} of ${total}</div>
          <div class="stax-review__page">
            <div class="stax-review__icon" aria-hidden="true">${p.icon}</div>
            <div class="stax-review__label">${p.label}</div>
            <div class="stax-review__value">${p.value}</div>
            ${p.sub ? `<div class="stax-review__sub">${p.sub}</div>` : ""}
          </div>
          <div class="stax-review__nav">
            ${prev}
            ${controls}
          </div>
          <button class="stax-review__reject" data-act="reject">Reject</button>
        </div>`;

      wire();
    }

    function setFill(ratio: number) {
      const fill = document.getElementById("staxFill");
      if (!fill) return;
      const stepped = Math.round(ratio * BAR_STEPS) / BAR_STEPS;
      fill.style.width = `${Math.min(stepped, 1) * 100}%`;
    }

    function startHold() {
      holdStart = performance.now();
      const tick = () => {
        const ratio = (performance.now() - holdStart) / HOLD_MS;
        setFill(ratio);
        if (ratio >= 1) {
          finish("approved");
          return;
        }
        holdRaf = requestAnimationFrame(tick);
      };
      holdRaf = requestAnimationFrame(tick);
    }
    function cancelHold() {
      cancelAnimationFrame(holdRaf);
      setFill(0);
    }

    function wire() {
      screenEl.querySelectorAll<HTMLElement>("[data-act]").forEach((node) => {
        const act = node.dataset.act;
        if (act === "next") node.onclick = () => { if (page < pages.length - 1) { page++; render(); } };
        if (act === "prev") node.onclick = () => { if (page > 0) { page--; render(); } };
        if (act === "reject") node.onclick = () => finish("rejected");
        if (act === "sign") node.onclick = () => finish("approved");
        if (act === "hold") {
          node.onpointerdown = (e) => { e.preventDefault(); startHold(); };
          node.onpointerup = cancelHold;
          node.onpointerleave = cancelHold;
          node.onpointercancel = cancelHold;
        }
      });
    }

    render();
  });
}
