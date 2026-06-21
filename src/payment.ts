// x402 client flow.
// - fetchTerms(): makes a REAL request that gets a REAL HTTP 402 with x402 terms.
// - buildAuthorization(): really constructs the EIP-712 transferWithAuthorization
//   typed-data message (EIP-3009) from those terms.
// - signAuthorization(): asks the server to sign. The server uses a SIMULATED
//   signer for now (USE_REAL_SIGNER=false); Phase 4 swaps in the Ledger Speculos
//   emulator. The browser never sees a private key.
// - settle(): re-requests the resource with the signed X-PAYMENT header and gets
//   the delivered service plus a SIMULATED settlement.

/** Buyo's wallet address (fake but consistent display + message value). */
export const BUYO_ADDRESS = "0x4C2a1bE7…BUYO";
const BUYO_ADDRESS_FULL = "0x4C2a1bE73D9f8A0c1B2d3E4F5a6B7c8D9e0F1A2b";

export interface PaymentTerms {
  scheme: string;
  network: string;
  chainId: number;
  maxAmountRequired: string;
  amountHuman: string;
  resource: string;
  description: string;
  payTo: string;
  payToDisplay: string;
  asset: string;
  nonce: string;
  validAfter: string;
  validBefore: string;
  extra: { name: string; version: string };
}

export interface TypedData {
  domain: {
    name: string;
    version: string;
    chainId: number;
    verifyingContract: string;
  };
  types: Record<string, { name: string; type: string }[]>;
  primaryType: "TransferWithAuthorization";
  message: {
    from: string;
    to: string;
    value: string;
    validAfter: string;
    validBefore: string;
    nonce: string;
  };
}

export interface Settlement {
  status: string;
  network: string;
  txHash: string;
  settledIn: string;
  simulated: boolean;
}

export interface Forecast {
  location: string;
  summary: string;
  tempC: number;
  updated: string;
}

export interface Config {
  useRealSigner: boolean;
  network: string;
  /** Public Speculos web UI URL, so the user can approve from a browser. */
  speculosPublicUrl?: string;
}

export async function fetchConfig(): Promise<Config> {
  try {
    const res = await fetch("/api/config");
    if (res.ok) return (await res.json()) as Config;
  } catch {
    /* fall through to default */
  }
  return { useRealSigner: false, network: "base", speculosPublicUrl: "" };
}

/** Make the unpaid request and read the REAL 402 terms. */
export async function fetchTerms(): Promise<PaymentTerms> {
  const res = await fetch("/api/weather");
  if (res.status !== 402) {
    throw new Error(`expected 402, got ${res.status}`);
  }
  const body = await res.json();
  const accept = body.accepts?.[0];
  if (!accept) throw new Error("no x402 terms in 402 response");
  return accept as PaymentTerms;
}

/** Really construct the EIP-3009 transferWithAuthorization EIP-712 message. */
export function buildAuthorization(terms: PaymentTerms): TypedData {
  return {
    domain: {
      name: terms.extra.name,
      version: terms.extra.version,
      chainId: terms.chainId,
      verifyingContract: terms.asset,
    },
    types: {
      TransferWithAuthorization: [
        { name: "from", type: "address" },
        { name: "to", type: "address" },
        { name: "value", type: "uint256" },
        { name: "validAfter", type: "uint256" },
        { name: "validBefore", type: "uint256" },
        { name: "nonce", type: "bytes32" },
      ],
    },
    primaryType: "TransferWithAuthorization",
    message: {
      from: BUYO_ADDRESS_FULL,
      to: terms.payTo,
      value: terms.maxAmountRequired,
      validAfter: terms.validAfter,
      validBefore: terms.validBefore,
      nonce: terms.nonce,
    },
  };
}

export interface Signed {
  signature: string;
  address?: string | null;
  simulated: boolean;
  /** Real mode only: the exact authorization the device signed (from = signer). */
  authorization?: TypedData["message"];
  /** Real mode only: the Ledger signer address. */
  signer?: string;
}

/** Ask the server to sign (simulated, or real on Speculos when enabled). */
export async function signAuthorization(typedData: TypedData): Promise<Signed> {
  const res = await fetch("/api/sign", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ typedData }),
  });
  if (!res.ok) {
    // Surface the server's real reason (e.g. cannot reach Speculos, blind
    // signing off, SW code) instead of a bare status.
    let detail = `sign failed (${res.status})`;
    try {
      const body = await res.json();
      if (body && (body.detail || body.error)) {
        detail = String(body.detail || body.error);
      }
    } catch {
      /* keep the status fallback */
    }
    throw new Error(detail);
  }
  return (await res.json()) as Signed;
}

/** Resend with the signed X-PAYMENT header; receive the service + settlement. */
export async function settle(
  typedData: TypedData,
  signed: Signed,
  terms: PaymentTerms,
): Promise<{ forecast: Forecast; settlement: Settlement }> {
  const paymentPayload = {
    x402Version: 1,
    scheme: terms.scheme,
    network: terms.network,
    payload: {
      signature: signed.signature,
      authorization: typedData.message,
    },
  };
  const header = btoa(JSON.stringify(paymentPayload));
  const res = await fetch("/api/weather", { headers: { "X-Payment": header } });
  if (!res.ok) throw new Error(`settle failed: ${res.status}`);
  const body = await res.json();
  return { forecast: body.weather as Forecast, settlement: body.settlement as Settlement };
}

/** Short display form for a long hex string: 0x1234…ABCD. */
export function shortHex(hex: string, lead = 6, tail = 4): string {
  if (!hex || hex.length <= lead + tail + 1) return hex;
  return `${hex.slice(0, lead)}…${hex.slice(-tail)}`;
}
