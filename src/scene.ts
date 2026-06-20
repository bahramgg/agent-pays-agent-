// The scene script: a small, readable data structure that drives the cartoon.
// Dialogue bubbles between Buyo and Sella, on-screen player CHOICES, and the
// seven story beats. The engine (engine.ts) interprets these nodes; the x402
// work happens in named `action`s the engine knows how to run.
//
// Text supports {tokens} that the engine fills from live values gathered during
// the flow (price, payTo, nonce, sigShort, txHash, forecast, wrapLine, ...).

export type Speaker = "buyo" | "sella" | "narrator" | "ledger";

/** Named side effects the engine runs when a node is entered. */
export type ActionKey =
  | "fetch402" // beat 2: real GET -> real HTTP 402 + x402 terms
  | "buildAuth" // beat 3: construct the EIP-712 transferWithAuthorization
  | "settle" // beat 5: send signed X-PAYMENT, simulated settlement
  | "reset"; // wrap: clear state to play again

export interface Choice {
  label: string;
  goto: string;
}

export interface SceneNode {
  /** Which of the seven beats this node belongs to (for readability). */
  beat: number;
  speaker: Speaker;
  /** Dialogue text; may contain {tokens}. */
  text: string;
  /** Optional async side effect to run before showing choices. */
  action?: ActionKey;
  /** Beat 4 only: run the Ledger Stax review + hold-to-sign, then sign. */
  approval?: boolean;
  /** Beat 4 only: where to go if the user rejects on the device. */
  onReject?: string;
  /** Player choices; if absent, `goto` auto-advances. */
  choices?: Choice[];
  goto?: string;
}

/** The full script, keyed by node id. `start` is the entry point. */
export const SCRIPT: Record<string, SceneNode> = {
  // ---- Beat 1: Meet -------------------------------------------------------
  start: {
    beat: 1,
    speaker: "buyo",
    text: "Sella! My drone is about to fly into a cloud I cannot see. Tell me you sell weather.",
    choices: [
      { label: "“Does the Weather Oracle take agents?”", goto: "offer" },
      { label: "“Something quick I can just pay for?”", goto: "offer" },
    ],
  },
  offer: {
    beat: 1,
    speaker: "sella",
    text: "Do I ever. The Weather Oracle is open over x402. One call, 0.01 USDC on Base. Fast, open, no account needed.",
    choices: [{ label: "Request the forecast", goto: "request" }],
  },

  // ---- Beat 2: 402 Payment Required (REAL from the server) ----------------
  request: {
    beat: 2,
    speaker: "narrator",
    text: "Buyo calls GET /api/weather with no payment attached…",
    action: "fetch402",
    goto: "got402",
  },
  got402: {
    beat: 2,
    speaker: "sella",
    text: "There is your 402 Payment Required. Pay {price} to {payTo} on {network}, nonce {nonce}, expiring at {expiry}.",
    choices: [{ label: "Prepare the payment authorization", goto: "prepare" }],
  },

  // ---- Beat 3: Prepare the EIP-712 authorization --------------------------
  prepare: {
    beat: 3,
    speaker: "buyo",
    text: "I am building an EIP-712 transferWithAuthorization. It lets the USDC move without me broadcasting a separate transaction first.",
    action: "buildAuth",
    choices: [{ label: "Send it to my Ledger Stax", goto: "confirm" }],
  },

  // ---- Beat 4: Ledger Stax review + hold-to-sign --------------------------
  confirm: {
    beat: 4,
    speaker: "ledger",
    text: "Over to the Ledger Stax. Swipe through the pages to review, then hold to sign. Your key never leaves the device.",
    approval: true,
    onReject: "cancelled",
    goto: "signed",
  },
  signed: {
    beat: 4,
    speaker: "buyo",
    text: "Held, signed, done. Signature {sigShort}. The private key never left the Stax.",
    choices: [{ label: "Settle on Base", goto: "settle" }],
  },
  cancelled: {
    beat: 4,
    speaker: "sella",
    text: "No worries, you rejected it on the device. Nothing was signed and nothing moved. The key stayed put.",
    choices: [
      { label: "Actually, let's pay", goto: "confirm" },
      { label: "Start over", goto: "__restart" },
    ],
  },

  // ---- Beat 5: Settle (simulated) -----------------------------------------
  settle: {
    beat: 5,
    speaker: "narrator",
    text: "The signed authorization goes to a facilitator that submits it to Base…",
    action: "settle",
    goto: "settled",
  },
  settled: {
    beat: 5,
    speaker: "sella",
    text: "Facilitator settled on {network} in {settledIn}. Transaction {txHash}. Settlement here is simulated.",
    choices: [{ label: "Deliver the forecast", goto: "deliver" }],
  },

  // ---- Beat 6: Deliver ----------------------------------------------------
  deliver: {
    beat: 6,
    speaker: "sella",
    text: "Here is your forecast for {location}: {forecast}. Thanks for paying with x402!",
    choices: [{ label: "Nice, thank you!", goto: "wrap" }],
  },

  // ---- Beat 7: Wrap -------------------------------------------------------
  wrap: {
    beat: 7,
    speaker: "buyo",
    text: "{wrapLine}",
    choices: [
      { label: "What just happened?", goto: "__explain" },
      { label: "Run it again", goto: "__restart" },
    ],
  },
};

export const START_NODE = "start";
