// server/ledgerSigner.mjs
// Real x402 EIP-712 signing on the Ledger Speculos emulator over raw APDU.
//
// This is the production version of the working reference script sign-eip712.mjs.
// It talks to Speculos directly over HTTP (no @ledgerhq/hw-app-eth or signer-kit,
// which have an ESM import bug under Node 24). Loaded by server.js ONLY when
// USE_REAL_SIGNER=true, so the simulated build never needs ethers or Speculos.
//
// APDUs (Ledger Ethereum app):
//   GET ADDRESS:     e0 02 00 00 <Lc> <path>
//   SIGN EIP-712:    e0 0c 00 00 <Lc> <path> <domainHash 32> <structHash 32>   (P2=00 hashed)
// Response: v(1) | r(32) | s(32) | SW(9000). v is normalized to 27/28 and the
// signature is verified to recover to the Ledger address. Requires the app's
// "Blind signing" setting to be ON. No secrets here: Speculos uses its test seed.

import { ethers } from "ethers";

const SPECULOS_URL = process.env.SPECULOS_URL || "http://localhost:5000";
const DERIVATION_PATH = process.env.LEDGER_DERIVATION_PATH || "44'/60'/0'/0/0";

// x402 USDC-on-Base domain + types (fixed).
const DOMAIN = {
  name: "USD Coin",
  version: "2",
  chainId: 8453,
  verifyingContract: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
};
const TYPES = {
  TransferWithAuthorization: [
    { name: "from", type: "address" },
    { name: "to", type: "address" },
    { name: "value", type: "uint256" },
    { name: "validAfter", type: "uint256" },
    { name: "validBefore", type: "uint256" },
    { name: "nonce", type: "bytes32" },
  ],
};

let cachedAddress = null;

function encodePath(path) {
  const parts = path.split("/").map((p) => {
    const hardened = p.endsWith("'");
    return (parseInt(p, 10) + (hardened ? 0x80000000 : 0)) >>> 0;
  });
  const buf = Buffer.alloc(1 + parts.length * 4);
  buf[0] = parts.length;
  parts.forEach((n, i) => buf.writeUInt32BE(n, 1 + i * 4));
  return buf;
}

function swMessage(sw) {
  const hints = {
    "6985": "denied on device, or Blind signing is OFF (enable it in the app Settings)",
    "6a80": "invalid data, or Blind signing is OFF",
    "6d00": "INS not supported by this app version (would need the streaming P2=01 variant)",
    "6511": "no app open / wrong app",
    "6e00": "wrong app or CLA",
  };
  return `Speculos returned SW=${sw} (${hints[sw] || "error"})`;
}

async function postApdu(apduHex) {
  let res;
  try {
    res = await fetch(`${SPECULOS_URL}/apdu`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ data: apduHex }),
    });
  } catch (err) {
    throw new Error(
      `Cannot reach the Ledger Speculos emulator at ${SPECULOS_URL}. Is it running? ` +
        (err && err.message ? err.message : String(err)),
    );
  }
  const json = await res.json().catch(() => ({}));
  const hex = String(json.data || "").toLowerCase();
  if (!hex) throw new Error(`Empty APDU response from Speculos: ${JSON.stringify(json)}`);
  return { body: hex.slice(0, -4), sw: hex.slice(-4) };
}

/** Read the Ledger address via the GET ADDRESS APDU (no on-device confirmation). */
export async function getLedgerAddress() {
  if (cachedAddress) return cachedAddress;
  const path = encodePath(DERIVATION_PATH);
  const apdu = Buffer.concat([Buffer.from([0xe0, 0x02, 0x00, 0x00, path.length]), path]).toString("hex");
  const { body, sw } = await postApdu(apdu);
  if (sw !== "9000") throw new Error(swMessage(sw));
  // Response: 1 byte pubkey len, pubkey, 1 byte addr len, addr (ascii hex chars), [chaincode]
  const buf = Buffer.from(body, "hex");
  let off = 0;
  const pkLen = buf[off];
  off += 1 + pkLen;
  const addrLen = buf[off];
  off += 1;
  const addrAscii = buf.slice(off, off + addrLen).toString("ascii");
  cachedAddress = ethers.getAddress("0x" + addrAscii);
  return cachedAddress;
}

/**
 * Build the x402 transferWithAuthorization typed-data with the given message
 * values (from is forced to the Ledger address, the real signer), sign its
 * EIP-712 hash on Speculos, and return the verified x402 payload.
 */
export async function signX402Authorization(message) {
  const from = await getLedgerAddress();
  const authorization = {
    from,
    to: ethers.getAddress(message.to),
    value: String(message.value),
    validAfter: String(message.validAfter ?? "0"),
    validBefore: String(message.validBefore),
    nonce: message.nonce,
  };

  const domainSeparator = ethers.TypedDataEncoder.hashDomain(DOMAIN);
  const hashStruct = ethers.TypedDataEncoder.from(TYPES).hashStruct("TransferWithAuthorization", authorization);

  const data = Buffer.concat([
    encodePath(DERIVATION_PATH),
    Buffer.from(domainSeparator.slice(2), "hex"),
    Buffer.from(hashStruct.slice(2), "hex"),
  ]);
  const apdu = Buffer.concat([Buffer.from([0xe0, 0x0c, 0x00, 0x00, data.length]), data]).toString("hex");

  const { body, sw } = await postApdu(apdu);
  if (sw !== "9000") throw new Error(swMessage(sw));

  const vRaw = parseInt(body.slice(0, 2), 16);
  const r = "0x" + body.slice(2, 66);
  const s = "0x" + body.slice(66, 130);

  // Normalize v to 27/28 and confirm the signature recovers to the Ledger address.
  let result = null;
  for (const cand of [vRaw, vRaw + 27, 27, 28]) {
    if (cand !== 27 && cand !== 28) continue;
    try {
      const sig = ethers.Signature.from({ r, s, v: cand }).serialized;
      const recovered = ethers.verifyTypedData(DOMAIN, TYPES, authorization, sig);
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
