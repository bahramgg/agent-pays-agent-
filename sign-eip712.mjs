// sign-eip712.mjs
// Sign an x402 EIP-712 transferWithAuthorization message on Speculos via raw APDU.
//
// Uses the Ledger Ethereum app "legacy" EIP-712 signing (CLA E0, INS 0C, P1 00,
// P2 00): the device blind-signs keccak256(0x1901 || domainSeparator || hashStruct)
// from the two 32-byte hashes. This requires the app's "Blind signing" setting to
// be ON (enable it in the Speculos device UI, see notes printed at the end).
//
// Connection mirrors your sign-tx.mjs: HTTP POST to <SPECULOS_URL>/apdu with
// { "data": "<apduHex>" }; the response hex is v(1) | r(32) | s(32) | SW(9000).
//
// Run:  node sign-eip712.mjs    (Speculos must be running on http://localhost:5000)

import { ethers } from "ethers";

const SPECULOS_URL = process.env.SPECULOS_URL || "http://localhost:5000";
const LEDGER_ADDRESS = "0xDad77910DbDFdE764fC21FCD4E74D71bBACA6D8D";
const DERIVATION_PATH = "44'/60'/0'/0/0";

// --- 1. x402 transferWithAuthorization typed data (USDC on Base) ------------
const domain = {
  name: "USD Coin",
  version: "2",
  chainId: 8453,
  verifyingContract: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
};
const types = {
  TransferWithAuthorization: [
    { name: "from", type: "address" },
    { name: "to", type: "address" },
    { name: "value", type: "uint256" },
    { name: "validAfter", type: "uint256" },
    { name: "validBefore", type: "uint256" },
    { name: "nonce", type: "bytes32" },
  ],
};
const message = {
  from: LEDGER_ADDRESS,
  to: "0x9aB7c4D2e1F0a3B5C6d7E8f90A1b2C3d4E5f6A7b", // sample recipient
  value: "10000", // 0.01 USDC (6 decimals)
  validAfter: "0",
  validBefore: String(Math.floor(Date.now() / 1000) + 3600), // now + 1 hour
  nonce: ethers.hexlify(ethers.randomBytes(32)),
};

// --- 2. Compute the EIP-712 hashes (ethers does the keccak work) ------------
const domainSeparator = ethers.TypedDataEncoder.hashDomain(domain);
const hashStruct = ethers.TypedDataEncoder.from(types).hashStruct("TransferWithAuthorization", message);
const digest = ethers.TypedDataEncoder.hash(domain, types, message); // for local verify

// --- 3. Build the APDU (e0 0c 00 00 | path | domainHash | structHash) -------
function encodePath(path) {
  const parts = path.split("/").map((p) => {
    const hardened = p.endsWith("'");
    const n = parseInt(p, 10) + (hardened ? 0x80000000 : 0);
    return n >>> 0;
  });
  const buf = Buffer.alloc(1 + parts.length * 4);
  buf[0] = parts.length;
  parts.forEach((n, i) => buf.writeUInt32BE(n, 1 + i * 4));
  return buf;
}
const data = Buffer.concat([
  encodePath(DERIVATION_PATH),
  Buffer.from(domainSeparator.slice(2), "hex"),
  Buffer.from(hashStruct.slice(2), "hex"),
]);
const apdu = Buffer.concat([Buffer.from([0xe0, 0x0c, 0x00, 0x00, data.length]), data]);

console.log("Path            :", DERIVATION_PATH);
console.log("Domain separator:", domainSeparator);
console.log("Struct hash     :", hashStruct);
console.log("EIP-712 digest  :", digest);
console.log("APDU            :", apdu.toString("hex"));
console.log("\n>> Sending to Speculos. Approve the prompt on the device UI now...\n");

// --- 4. Send to Speculos ----------------------------------------------------
const res = await fetch(`${SPECULOS_URL}/apdu`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ data: apdu.toString("hex") }),
});
const json = await res.json().catch(() => ({}));
const respHex = String(json.data || "").toLowerCase();
if (!respHex) {
  console.error("No APDU response from Speculos:", json);
  process.exit(1);
}

const sw = respHex.slice(-4);
if (sw !== "9000") {
  const hints = {
    "6985": "denied on device, or Blind signing is OFF (enable it in the app Settings)",
    "6a80": "invalid data, or Blind signing is OFF",
    "6d00": "INS 0x0C not supported by this app version",
    "6511": "no app open / wrong app",
  };
  console.error(`Speculos returned SW=${sw} (${hints[sw] || "error"}). Full: ${respHex}`);
  process.exit(1);
}

// --- 5. Parse v|r|s and verify the signature against the Ledger address ------
const body = respHex.slice(0, -4);
const vRaw = parseInt(body.slice(0, 2), 16);
const r = "0x" + body.slice(2, 66);
const s = "0x" + body.slice(66, 130);
console.log("Device response -> v:", vRaw, "r:", r, "s:", s);

let matched = null;
for (const cand of [vRaw, vRaw + 27, 27, 28]) {
  if (cand !== 27 && cand !== 28) continue;
  let sig;
  try {
    sig = ethers.Signature.from({ r, s, v: cand }).serialized;
    const recovered = ethers.verifyTypedData(domain, types, message, sig);
    if (recovered.toLowerCase() === LEDGER_ADDRESS.toLowerCase()) {
      matched = { sig, v: cand };
      break;
    }
  } catch {
    /* try next candidate */
  }
}

if (!matched) {
  console.error("\nSignature did NOT verify against", LEDGER_ADDRESS);
  console.error("Double-check the derivation path and the address.");
  process.exit(1);
}

console.log("\nVERIFIED: recovered signer == Ledger address.");
console.log("v (normalized) :", matched.v);
console.log("signature (65b):", matched.sig);
console.log("\nx402 payment authorization payload:");
console.log(JSON.stringify({ authorization: message, signature: matched.sig }, null, 2));
