// server/ledgerSigner.mjs
// Real x402 EIP-712 CLEAR signing on Ledger via the Ledger Device Management Kit.
//
// This follows the Ledger Agent Stack docs: it drives the device through the
// official DMK stack rather than raw APDUs.
//   - @ledgerhq/device-management-kit         (DMK core)
//   - @ledgerhq/device-transport-kit-speculos (HTTP transport to a hosted Speculos)
//   - @ledgerhq/device-signer-kit-ethereum    (the Ethereum Signer: signTypedData)
//   - @ledgerhq/context-module                (clear-signing descriptor resolution)
//
// Clear signing (not blind): signTypedData streams the full EIP-712 message and
// the Signer fetches the signed ERC-7730 descriptor through the Context Module,
// so the DEVICE displays the curated fields (From / To / Amount) and the user
// approves exactly what is signed. The private key stays in hardware.
//
// Descriptor source: the Context Module fetches the signed ERC-7730 descriptor
// from Ledger's CAL service. Curated clear signing requires a valid partner
// `originToken` (set LEDGER_ORIGIN_TOKEN; enroll at
// https://developers.ledger.com/docs/clear-signing/for-wallets). WITHOUT a valid
// token the descriptor is not served and the device shows raw fields / blind
// signing -- this is Ledger's documented behavior, not a bug. CAL must also be
// reachable (a normal, non-datacenter network); CAL_MIRROR_URL can override it.
//
// The DMK ESM build has directory imports Node cannot resolve, so we load the
// CommonJS builds via createRequire. This module is imported by server.js ONLY
// when USE_REAL_SIGNER=true. No secrets here: Speculos uses its test seed.

import { createRequire } from "module";
import { ethers } from "ethers";

const require = createRequire(import.meta.url);
const { DeviceManagementKitBuilder, DeviceActionStatus } = require("@ledgerhq/device-management-kit");
const { speculosTransportFactory } = require("@ledgerhq/device-transport-kit-speculos");
const { SignerEthBuilder } = require("@ledgerhq/device-signer-kit-ethereum");
const { ContextModuleBuilder, ContextModuleChainID } = require("@ledgerhq/context-module");
const { firstValueFrom, timeout } = require("rxjs");

const SPECULOS_URL = process.env.SPECULOS_URL || "http://localhost:5000";
const DERIVATION_PATH = process.env.LEDGER_DERIVATION_PATH || "44'/60'/0'/0/0";
const DISCOVER_TIMEOUT_MS = Number(process.env.SPECULOS_ADDRESS_TIMEOUT_MS || 12000);
// Optional CAL mirror for hosted deploys; unset = use Ledger's real CAL (default).
const CAL_MIRROR_URL = process.env.CAL_MIRROR_URL || "";

// x402 USDC-on-Base typed data (fixed).
const DOMAIN = {
  name: "USD Coin",
  version: "2",
  chainId: 8453,
  verifyingContract: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
};
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

let dmk = null;
let sessionId = null;
let signerPromise = null;

/** Build the DMK, connect to Speculos, and build the Ethereum signer (once). */
async function getSigner() {
  if (!signerPromise) {
    signerPromise = (async () => {
      dmk = new DeviceManagementKitBuilder()
        .addTransport(speculosTransportFactory(SPECULOS_URL))
        .build();
      const device = await firstValueFrom(dmk.startDiscovering({}).pipe(timeout(DISCOVER_TIMEOUT_MS)));
      sessionId = await dmk.connect({ device });

      // Context Module resolves the clear-signing descriptor from Ledger's CAL.
      // A valid partner originToken (LEDGER_ORIGIN_TOKEN) is what unlocks curated
      // clear signing; without it CAL returns nothing and the device shows raw /
      // blind. CAL_MIRROR_URL can point the lookup at a mirror.
      const originToken = process.env.LEDGER_ORIGIN_TOKEN || "agent-pays-agent";
      const ctxBuilder = new ContextModuleBuilder({ originToken }).setChain(ContextModuleChainID.Ethereum);
      if (CAL_MIRROR_URL) {
        ctxBuilder.setCalConfig({ url: CAL_MIRROR_URL, mode: "prod", branch: "main" });
      }
      const contextModule = ctxBuilder.build();

      return new SignerEthBuilder({ dmk, sessionId }).withContextModule(contextModule).build();
    })().catch((err) => {
      signerPromise = null; // allow retry on a later request
      throw err;
    });
  }
  return signerPromise;
}

/** Drive a DMK device-action observable to its terminal state. */
function runDeviceAction(observable, label) {
  return new Promise((resolve, reject) => {
    const sub = observable.subscribe({
      next: (state) => {
        if (state.status === DeviceActionStatus.Completed) {
          resolve(state.output);
          sub.unsubscribe();
        } else if (state.status === DeviceActionStatus.Error) {
          reject(explainDeviceError(state.error, label));
          sub.unsubscribe();
        }
      },
      error: (err) => reject(explainDeviceError(err, label)),
      complete: () => {},
    });
  });
}

function explainDeviceError(err, label) {
  const code = err && (err.errorCode || (err.customErrorCode ?? null));
  const msg = (err && (err.message || err.originalError?.message)) || String(err);
  if (code === "6985") {
    return new Error("Rejected on the device.");
  }
  if (code === "6a80") {
    return new Error(
      "Invalid EIP-712 data, or no clear-signing descriptor was available so the device " +
        "required blind signing. Set a valid LEDGER_ORIGIN_TOKEN (and ensure CAL is reachable).",
    );
  }
  return new Error(`${label} failed: ${code ? `SW=${code} ` : ""}${msg}`);
}

let cachedAddress = null;

/** Read the Ledger address (no on-device confirmation). */
export async function getLedgerAddress() {
  if (cachedAddress) return cachedAddress;
  const signer = await getSigner();
  const { observable } = signer.getAddress(DERIVATION_PATH, { checkOnDevice: false });
  const out = await runDeviceAction(observable, "Get address");
  cachedAddress = ethers.getAddress(out.address);
  return cachedAddress;
}

/**
 * Build the x402 transferWithAuthorization typed data (from is forced to the
 * Ledger address), clear-sign it on the device via DMK, and return the verified
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

  const signer = await getSigner();
  const { observable } = signer.signTypedData(DERIVATION_PATH, typedData);
  const raw = await runDeviceAction(observable, "Sign typed data"); // { r, s, v }

  const r = raw.r.startsWith("0x") ? raw.r : "0x" + raw.r;
  const s = raw.s.startsWith("0x") ? raw.s : "0x" + raw.s;
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
