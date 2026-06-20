// The scene script: a small, readable data structure that drives the cartoon.
// Dialogue between Buyo and Sella, the on-screen player CHOICES, the seven
// story beats, and a 5-step status label so it is always obvious what is
// happening. The engine interprets these nodes; the x402 work happens in named
// `action`s the engine knows how to run.
//
// Text supports {tokens} that the engine fills from live values gathered during
// the flow (price, payTo, nonce, sigShort, txHash, forecast, wrapLine, ...).

export type Speaker = "buyo" | "sella" | "narrator" | "system";

/** Named side effects the engine runs when a node is entered. */
export type ActionKey =
  | "fetch402" // real GET -> real HTTP 402 + x402 terms
  | "buildAuth" // construct the EIP-712 transferWithAuthorization
  | "settle" // send signed X-PAYMENT, simulated settlement
  | "reset"; // wrap: clear state to play again

export interface Choice {
  label: string;
  goto: string;
}

export interface SceneNode {
  /** 1..5 status step, with a plain-language label for the status line. */
  step: number;
  status: string;
  speaker: Speaker;
  /** Dialogue text; may contain {tokens}. */
  text: string;
  /** Optional async side effect to run before showing choices. */
  action?: ActionKey;
  /** Run the clear-signing review + hold-to-sign, then sign. */
  approval?: boolean;
  /** Where to go if the user rejects on the card. */
  onReject?: string;
  /** Player choices; if absent, `goto` auto-advances. */
  choices?: Choice[];
  goto?: string;
}

export const TOTAL_STEPS = 5;

export const SCRIPT: Record<string, SceneNode> = {
  // ---- Step 1: Meet -------------------------------------------------------
  start: {
    step: 1,
    status: "Buyo and Sella meet",
    speaker: "buyo",
    text: "Sella! My drone is about to fly into a cloud I cannot see. Tell me you sell weather.",
    choices: [
      { label: "“Does the Weather Oracle take agents?”", goto: "offer" },
      { label: "“Something quick I can just pay for?”", goto: "offer" },
    ],
  },
  offer: {
    step: 1,
    status: "Sella offers her Weather Oracle",
    speaker: "sella",
    text: "Do I ever. The Weather Oracle is open over x402. One call, 0.01 USDC on Base. Fast, open, no account needed.",
    choices: [{ label: "Request the forecast", goto: "request" }],
  },

  // ---- Step 2: Payment required (HTTP 402) --------------------------------
  request: {
    step: 2,
    status: "Buyo requests the forecast",
    speaker: "narrator",
    text: "Buyo calls GET /api/weather with no payment attached…",
    action: "fetch402",
    goto: "got402",
  },
  got402: {
    step: 2,
    status: "Sella asks for payment (HTTP 402)",
    speaker: "sella",
    text: "There is your 402 Payment Required. Pay {price} to {payTo} on {network}, nonce {nonce}, good until {expiry}.",
    choices: [{ label: "Prepare the payment", goto: "prepare" }],
  },

  // ---- Step 3: Review and sign -------------------------------------------
  prepare: {
    step: 3,
    status: "Building the EIP-712 authorization",
    speaker: "buyo",
    text: "I am building an EIP-712 transferWithAuthorization. It lets the USDC move without me broadcasting a separate transaction first.",
    action: "buildAuth",
    choices: [{ label: "Open the clear-signing card", goto: "confirm" }],
  },
  confirm: {
    step: 3,
    status: "Review and sign (clear signing)",
    speaker: "system",
    text: "Check the clear-signing card below. It shows exactly what you sign. Hold to sign, or reject.",
    approval: true,
    onReject: "cancelled",
    goto: "signed",
  },
  signed: {
    step: 3,
    status: "Signed (simulated)",
    speaker: "buyo",
    text: "Signed. Signature {sigShort}. The private key never left the device.",
    choices: [{ label: "Settle on Base", goto: "settle" }],
  },
  cancelled: {
    step: 3,
    status: "Payment cancelled",
    speaker: "sella",
    text: "No worries, you rejected it on review. Nothing was signed and nothing moved.",
    choices: [
      { label: "Actually, let's pay", goto: "confirm" },
      { label: "Start over", goto: "__restart" },
    ],
  },

  // ---- Step 4: Settle (simulated) ----------------------------------------
  settle: {
    step: 4,
    status: "Settling on Base (simulated)",
    speaker: "narrator",
    text: "The signed authorization goes to a facilitator that submits it to Base…",
    action: "settle",
    goto: "settled",
  },
  settled: {
    step: 4,
    status: "Settled on Base (simulated)",
    speaker: "sella",
    text: "Facilitator settled on {network} in {settledIn}. Transaction {txHash}. Settlement here is simulated.",
    choices: [{ label: "Deliver the forecast", goto: "deliver" }],
  },

  // ---- Step 5: Deliver ----------------------------------------------------
  deliver: {
    step: 5,
    status: "Sella delivers the forecast",
    speaker: "sella",
    text: "Here is your forecast for {location}: {forecast}. Thanks for paying with x402!",
    choices: [{ label: "Nice, thank you!", goto: "wrap" }],
  },
  wrap: {
    step: 5,
    status: "Done",
    speaker: "buyo",
    text: "{wrapLine}",
    choices: [
      { label: "How it works", goto: "__explain" },
      { label: "Run it again", goto: "__restart" },
    ],
  },
};

export const START_NODE = "start";
