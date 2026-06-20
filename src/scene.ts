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
  | "prepareScreen" // beat 4: load human-readable fields onto the Ledger screen
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
  /** Beat 4 only: wait for the physical Ledger button press, then sign. */
  approval?: boolean;
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
    text: "Morning, Sella! I am routing a delivery drone and I need today's forecast.",
    choices: [
      { label: "“Can your Weather Oracle help?”", goto: "offer" },
      { label: "“Got anything quick and paid?”", goto: "offer" },
    ],
  },
  offer: {
    beat: 1,
    speaker: "sella",
    text: "Absolutely. My Weather Oracle is open over x402. One call is 0.01 USDC on Base. Fast and open.",
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
    choices: [{ label: "Send it to my Ledger Nano", goto: "confirm" }],
  },

  // ---- Beat 4: Ledger Nano confirmation (press to approve) ----------------
  confirm: {
    beat: 4,
    speaker: "ledger",
    text: "Read the fields on the Ledger Nano, then press the right button to approve. Your key never leaves the device.",
    action: "prepareScreen",
    approval: true,
    goto: "signed",
  },
  signed: {
    beat: 4,
    speaker: "buyo",
    text: "Approved on the device. Signature {sigShort}. The private key never left the Ledger.",
    choices: [{ label: "Settle on Base", goto: "settle" }],
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
