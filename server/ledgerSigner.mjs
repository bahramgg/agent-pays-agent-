// server/ledgerSigner.mjs
// Real x402 EIP-712 CLEAR signing on the Ledger Speculos emulator.
//
// Clear signing (not blind): the full EIP-712 typed data is streamed to the
// Ledger Ethereum app so the DEVICE displays the actual fields (to, value,
// nonce, ...) and the user approves exactly what is being signed. The private
// key stays in hardware. This is the opposite of the legacy "hashed" path,
// which sent only two 32-byte hashes and therefore required the app's
// "Blind signing" toggle.
//
// We drive the official Ledger SDK (@ledgerhq/hw-app-eth) over a tiny custom
// transport that POSTs APDUs to Speculos at <SPECULOS_URL>/apdu. The SDK's
// signEIP712Message does the full message streaming for us:
//   E0 1A  EIP712_SEND_STRUCT_DEFINITION     (type schema)
//   E0 1C  EIP712_SEND_STRUCT_IMPLEMENTATION (field values)
//   E0 1E  EIP712_SEND_FILTERING             (ERC-7730 clear-signing descriptor)
//   E0 0C 00 01  SIGN (full mode, path only — message already streamed)
// The SDK fetches the signed ERC-7730 filtering descriptor from Ledger's CAL
// service. Ledger's registry has one for Circle USDC transferWithAuthorization
// (x402) on Base, so the device shows a curated view (From / To / Amount, e.g.
// "0.01 USDC") and hides nonce / validAfter / validBefore. That is true clear
// signing: no "blind signing" toggle, no raw-field dump. The web service must
// be able to reach the CAL service for the descriptor; otherwise the SDK falls
// back to streaming the raw struct (which needs the device's "Display raw
// messages" setting). Blind signing is never required.
//
// The hw-app-eth ESM build (lib-es) has extensionless imports that Node cannot
// resolve, so we load its CommonJS build via createRequire. This module is
// imported by server.js ONLY when USE_REAL_SIGNER=true, so the simulated build
// never needs ethers, the Ledger SDK, or Speculos. No secrets here: Speculos
// uses its test seed.

import { createRequire } from "module";
import { ethers } from "ethers";

const require = createRequire(import.meta.url);
// CommonJS builds (the ESM "lib-es" builds are broken under Node).
const Eth = require("@ledgerhq/hw-app-eth").default;
const Transport = require("@ledgerhq/hw-transport").default;

const SPECULOS_URL = process.env.SPECULOS_URL || "http://localhost:5000";
const DERIVATION_PATH = process.env.LEDGER_DERIVATION_PATH || "44'/60'/0'/0/0";
// Address read is instant; signing waits for the user to approve on the device.
const ADDRESS_TIMEOUT_MS = Number(process.env.SPECULOS_ADDRESS_TIMEOUT_MS || 10000);
const SIGN_TIMEOUT_MS = Number(process.env.SPECULOS_SIGN_TIMEOUT_MS || 120000);

// x402 USDC-on-Base domain + types (fixed). EIP712Domain is included because
// the SDK streams the domain struct too.
const DOMAIN = {
  name: "USD Coin",
  version: "2",
  chainId: 8453,
  verifyingContract: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
};
const CAL_SERVICE_URL = process.env.CAL_SERVICE_URL || "https://crypto-assets-service.api.ledger.com";
// Schema hash of our exact TransferWithAuthorization typed data (computed with
// Ledger's evm-tools getSchemaHashForMessage). The CAL descriptor is keyed by it.
const OUR_SCHEMA_HASH = "1cb336ca4e31494498ce2c7f0c1e7514c5646e5b0636f8cce4ccbe14";
// Static-fallback key the SDK uses: `${chainId}:${contractLowercase}:${schemaHash}`.
const STATIC_KEY = `${DOMAIN.chainId}:${DOMAIN.verifyingContract.toLowerCase()}:${OUR_SCHEMA_HASH}`;
// Ledger's CAL edge/WAF returns 403 to bot-like clients (a bare fetch sends
// User-Agent "node"; even the SDK's axios UA is filtered). A normal browser
// User-Agent gets the public, read-only descriptor through.
const CAL_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  Accept: "application/json",
};
// A signed descriptor can also be baked in (env or committed JSON) so runtime
// never needs the CAL at all. LEDGER_EIP712_FILTERS is the MessageFilters JSON.
let bundledFilters = null;
try {
  bundledFilters = process.env.LEDGER_EIP712_FILTERS ? JSON.parse(process.env.LEDGER_EIP712_FILTERS) : null;
} catch {
  bundledFilters = null;
}

let cachedFilters = bundledFilters; // the signed MessageFilters, once known
let lastCalStatus = bundledFilters ? "using bundled descriptor" : "not attempted";

/**
 * Fetch the signed ERC-7730 EIP-712 filter for our message from Ledger's CAL
 * service (browser User-Agent, to pass the edge WAF). Returns the MessageFilters
 * object or null. Cached on success; records lastCalStatus for diagnostics.
 */
async function getMessageFilters() {
  if (cachedFilters) return cachedFilters;
  const contract = DOMAIN.verifyingContract.toLowerCase();
  const url =
    `${CAL_SERVICE_URL}/v1/dapps?output=eip712_signatures` +
    `&eip712_signatures_version=v2&chain_id=${DOMAIN.chainId}&contracts=${contract}`;
  try {
    const r = await fetch(url, { headers: CAL_HEADERS, signal: AbortSignal.timeout(8000) });
    if (r.status !== 200) {
      lastCalStatus = `CAL http ${r.status}`;
      return null;
    }
    const data = await r.json();
    const item = Array.isArray(data)
      ? data.find((x) => x?.eip712_signatures?.[contract]?.[OUR_SCHEMA_HASH])
      : null;
    const filters = (item && item.eip712_signatures[contract][OUR_SCHEMA_HASH]) || null;
    lastCalStatus = filters ? "descriptor fetched" : "CAL ok but no descriptor for our schema";
    if (filters) cachedFilters = filters;
    return filters;
  } catch (e) {
    lastCalStatus = `CAL fetch failed: ${(e && e.message) || e}`;
    return null;
  }
}
const PRIMARY_TYPE = "TransferWithAuthorization";
const TYPES = {
  EIP712Domain: [
    { name: "name", type: "string" },
    { name: "version", type: "string" },
    { name: "chainId", type: "uint256" },
    { name: "verifyingContract", type: "address" },
  ],
  TransferWithAuthorization: [
    { name: "from", type: "address" },
    { name: "to", type: "address" },
    { name: "value", type: "uint256" },
    { name: "validAfter", type: "uint256" },
    { name: "validBefore", type: "uint256" },
    { name: "nonce", type: "bytes32" },
  ],
};
// ethers verifies against the message types only (no EIP712Domain entry).
const VERIFY_TYPES = { TransferWithAuthorization: TYPES.TransferWithAuthorization };

/** Minimal Ledger transport that ferries APDUs to Speculos over HTTP. */
class SpeculosHttpTransport extends Transport {
  constructor() {
    super();
    this.resetDiag();
  }

  // Diagnostics so we can tell clear signing from the raw fallback: did any
  // EIP-712 filtering APDU (E0 1E) get sent (descriptor fetched + applied), and
  // which APDU/SW failed.
  resetDiag() {
    this.sawFiltering = false;
    this.lastReqIns = null;
    this.lastSw = null;
  }

  async exchange(apdu) {
    const hex = apdu.toString("hex");
    this.lastReqIns = hex.slice(0, 8);
    if (hex.startsWith("e01e")) this.sawFiltering = true;
    // The SIGN APDU blocks on user approval; everything else is instant.
    const timeoutMs = hex.startsWith("e00c") ? SIGN_TIMEOUT_MS : ADDRESS_TIMEOUT_MS;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let res;
    try {
      res = await fetch(`${SPECULOS_URL}/apdu`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ data: hex }),
        signal: controller.signal,
      });
    } catch (err) {
      if (err && err.name === "AbortError") {
        throw new Error(
          `No response from the Ledger within ${Math.round(timeoutMs / 1000)}s ` +
            `(did you approve on the device?).`,
        );
      }
      throw new Error(
        `Cannot reach the Ledger Speculos emulator at ${SPECULOS_URL}. Is it running? ` +
          (err && err.message ? err.message : String(err)),
      );
    } finally {
      clearTimeout(timer);
    }
    const json = await res.json().catch(() => ({}));
    const respHex = String(json.data || "");
    if (!respHex) throw new Error(`Empty APDU response from Speculos: ${JSON.stringify(json)}`);
    this.lastSw = respHex.slice(-4);
    // Base Transport.send checks the trailing status word and throws on non-9000.
    return Buffer.from(respHex, "hex");
  }
}

let transport = null;
function ensureTransport() {
  if (!transport) transport = new SpeculosHttpTransport();
  return transport;
}

// Build an Eth client. For signing we hand it the signed descriptor as a static
// filter (and disable the SDK's own CAL fetch, which the WAF 403s) so the device
// clear-signs the curated Circle USDC fields (From / To / Amount), hiding nonce /
// validAfter / validBefore. Without a descriptor it streams the raw message.
function makeEth(filters) {
  const loadConfig = filters
    ? { staticEIP712SignaturesV2: { [STATIC_KEY]: filters }, calServiceURL: null }
    : {};
  return new Eth(ensureTransport(), "w0w", loadConfig);
}

function explainError(err) {
  const msg = (err && err.message) || String(err);
  // hw-transport throws TransportStatusError with a numeric statusCode for SWs.
  const sw = err && err.statusCode ? err.statusCode.toString(16).padStart(4, "0") : null;
  if (sw === "6985") {
    return new Error(
      "Rejected on the device, or clear signing is not enabled. Turn ON " +
        '"Display raw messages" in the Ethereum app settings (Blind signing is not needed).',
    );
  }
  if (sw === "6a80") {
    return new Error('Invalid EIP-712 data, or "Display raw messages" is OFF in the Ethereum app settings.');
  }
  if (sw) return new Error(`Speculos returned SW=${sw}. ${msg}`);
  return err instanceof Error ? err : new Error(msg);
}

let cachedAddress = null;

/** Read the Ledger address (no on-device confirmation). */
export async function getLedgerAddress() {
  if (cachedAddress) return cachedAddress;
  try {
    const eth = makeEth(null);
    const { address } = await eth.getAddress(DERIVATION_PATH, false);
    cachedAddress = ethers.getAddress(address);
    return cachedAddress;
  } catch (err) {
    throw explainError(err);
  }
}

/**
 * Build the x402 transferWithAuthorization typed data with the given message
 * values (from is forced to the Ledger address, the real signer), clear-sign
 * it on Speculos by streaming the full EIP-712 message, and return the verified
 * x402 payload.
 */
export async function signX402Authorization(message) {
  const from = await getLedgerAddress();
  const authorization = {
    from,
    // Lowercase before getAddress so a placeholder recipient with a non-checksum
    // mixed case still normalizes instead of throwing "bad address checksum".
    to: ethers.getAddress(String(message.to).toLowerCase()),
    value: String(message.value),
    validAfter: String(message.validAfter ?? "0"),
    validBefore: String(message.validBefore),
    nonce: message.nonce,
  };

  const typedData = {
    domain: DOMAIN,
    types: TYPES,
    primaryType: PRIMARY_TYPE,
    message: authorization,
  };

  // Fetch (or reuse) the signed descriptor and hand it to the SDK as a static
  // filter, so the device clear-signs the curated fields.
  const filters = await getMessageFilters();

  let raw;
  try {
    const eth = makeEth(filters);
    ensureTransport().resetDiag();
    // Clear signing: streams the message with the descriptor applied; the device
    // shows the curated fields (From / To / Amount) for the user to approve.
    raw = await eth.signEIP712Message(DERIVATION_PATH, typedData);
  } catch (err) {
    // Did the E0 1E filtering APDUs actually go out (curated clear signing), or
    // did it fall back to the raw message? Report that plus why the descriptor
    // was or was not available.
    const loaded = transport && transport.sawFiltering;
    const diag =
      ` [descriptor ${loaded ? "applied" : "NOT applied"}; last APDU ${transport ? transport.lastReqIns : "?"}` +
      ` -> SW ${transport ? transport.lastSw : "?"}; CAL: ${lastCalStatus}]`;
    const e = explainError(err);
    e.message += diag;
    throw e;
  }

  const r = "0x" + raw.r;
  const s = "0x" + raw.s;
  const vRaw = typeof raw.v === "number" ? raw.v : parseInt(raw.v, 16);

  // Normalize v to 27/28 and confirm the signature recovers to the Ledger address.
  let result = null;
  for (const cand of [vRaw, vRaw + 27, 27, 28]) {
    if (cand !== 27 && cand !== 28) continue;
    try {
      const sig = ethers.Signature.from({ r, s, v: cand }).serialized;
      const recovered = ethers.verifyTypedData(DOMAIN, VERIFY_TYPES, authorization, sig);
      if (recovered.toLowerCase() === from.toLowerCase()) {
        result = { signature: sig, v: cand, r, s };
        break;
      }
    } catch {
      /* try next candidate */
    }
  }
  if (!result) throw new Error("Signature did not verify against the Ledger address.");

  return {
    authorization,
    signature: result.signature,
    v: result.v,
    r: result.r,
    s: result.s,
    signer: from,
    simulated: false,
  };
}
