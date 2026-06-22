// infra/clearsign-app/gen-filters.mjs
// Generate the SIGNED EIP-712 clear-signing filter descriptor for the x402
// USDC TransferWithAuthorization message, signed with the PUBLIC test key
// (cal.pem). The Speculos app built with CAL_TEST_KEY=1 trusts this key, so the
// device clear-signs the message with NO Ledger CAL, no gating token, no blind
// signing.
//
// The signature preimage matches the device exactly (app-ethereum
// src/features/sign_message_eip712/filtering.c -> sig_verif_start):
//   sha256( magic(1) | chainId(8, big-endian) | contract(20) | schemaHash(28)
//           | <filter-specific bytes> )
// signed (ECDSA/secp256k1, DER) with cal.pem. The schema hash is
// SHA224(JSON.stringify(sortObjectAlphabetically(types))), the same value
// @ledgerhq/evm-tools computes for the static-filter lookup key.
//
// Output: server/eip712-usdc-base-filters.json  (the inner MessageFilters
// object the signer injects via hw-app-eth staticEIP712SignaturesV2).
//
// Run:  node infra/clearsign-app/gen-filters.mjs

import crypto from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..", "..");

const calKey = crypto.createPrivateKey(readFileSync(join(HERE, "cal.pem"), "utf8"));

const CHAIN_ID = 8453;
const CONTRACT = "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913"; // USDC on Base (lowercase)
const MESSAGE_NAME = "Authorize USDC transfer";

// Must match the signer's TYPES exactly (this is what the device streams).
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

// Filter magics (app-ethereum InputData.py / filtering.c).
const MAGIC_MESSAGE_INFO = 183;
const MAGIC_RAW = 72;
const MAGIC_AMOUNT_VALUE = 22;
// The amount's token is the EIP-712 verifying contract (USDC itself), which the
// app/CAL reference by coin ref 255 (0xff) for "Permit"-like messages.
const COIN_REF_VERIFYING = 255;

// USDC token info so the amount renders as "0.01 USDC" instead of "10000".
const TOKEN_TICKER = "USDC";
const TOKEN_DECIMALS = 6;

// SHA224 of the alphabetically-sorted types (recursive) -> the device's schema hash.
const sortAlpha = (o) =>
  Object.keys(o)
    .sort()
    .reduce((acc, k) => {
      acc[k] = Array.isArray(o[k]) ? o[k].map(sortAlpha) : o[k];
      return acc;
    }, {});
const schemaHash = crypto
  .createHash("sha224")
  .update(JSON.stringify(sortAlpha(TYPES)))
  .digest("hex");

// Common signature-payload prefix (matches sig_verif_start on the device).
function prefix(magic) {
  const buf = Buffer.alloc(1 + 8 + 20 + 28);
  buf.writeUInt8(magic, 0);
  buf.writeBigUInt64BE(BigInt(CHAIN_ID), 1);
  Buffer.from(CONTRACT.slice(2), "hex").copy(buf, 9);
  Buffer.from(schemaHash, "hex").copy(buf, 29);
  return buf;
}
// ECDSA/secp256k1 over sha256(payload), DER-encoded, with the test CAL key.
function sign(payload) {
  return crypto.createSign("sha256").update(payload).sign({ key: calKey, dsaEncoding: "der" }).toString("hex");
}

// Only these fields are filtered (shown). Any message field NOT listed here is
// hidden by the app (it stays part of the signed hash but is not displayed),
// because the signed message-info attests how many fields the curated view has.
// So omitting validAfter / validBefore / nonce hides them. `value` uses the
// "amount" format bound to the verifying contract (USDC) -> "0.01 USDC".
const fields = [
  { path: "from", label: "From", format: "raw" },
  { path: "to", label: "To", format: "raw" },
  { path: "value", label: "Amount", format: "amount" },
];

// message info (a.k.a. contractName): prefix | filtersCount(1) | name
const messageInfoPayload = Buffer.concat([
  prefix(MAGIC_MESSAGE_INFO),
  Buffer.from([fields.length]),
  Buffer.from(MESSAGE_NAME, "ascii"),
]);
const contractName = { label: MESSAGE_NAME, signature: sign(messageInfoPayload) };

const outFields = fields.map((f) => {
  if (f.format === "amount") {
    // amount value filter (magic 22): prefix | path | displayName | joinId(=255)
    const payload = Buffer.concat([
      prefix(MAGIC_AMOUNT_VALUE),
      Buffer.from(f.path, "ascii"),
      Buffer.from(f.label, "ascii"),
      Buffer.from([COIN_REF_VERIFYING]),
    ]);
    return { format: "amount", coin_ref: COIN_REF_VERIFYING, label: f.label, path: f.path, signature: sign(payload) };
  }
  // raw field filter (magic 72): prefix | path | displayName
  const payload = Buffer.concat([prefix(MAGIC_RAW), Buffer.from(f.path, "ascii"), Buffer.from(f.label, "ascii")]);
  return { format: "raw", label: f.label, path: f.path, signature: sign(payload) };
});

const filters = { contractName, fields: outFields };
const outPath = join(ROOT, "server", "eip712-usdc-base-filters.json");
writeFileSync(outPath, JSON.stringify(filters, null, 2) + "\n");

// --- USDC token info blob (so the amount shows "0.01 USDC") ----------------
// provideERC20 payload = tickerLen(1) | ticker | address(20) | decimals(4 BE)
//   | chainId(4 BE) | signature. The device hashes everything after tickerLen
// and verifies it with the same COIN_META key (cal.pem). hw-app-eth fetches the
// blob (base64 of: uint32BE(itemLen) | item) from cryptoassetsBaseURL.
const tickerBuf = Buffer.from(TOKEN_TICKER, "ascii");
const addrBuf = Buffer.from(CONTRACT.slice(2), "hex");
const decBuf = Buffer.alloc(4);
decBuf.writeUInt32BE(TOKEN_DECIMALS);
const chainBuf = Buffer.alloc(4);
chainBuf.writeUInt32BE(CHAIN_ID);
const tokenSig = crypto
  .createSign("sha256")
  .update(Buffer.concat([tickerBuf, addrBuf, decBuf, chainBuf]))
  .sign({ key: calKey, dsaEncoding: "der" });
const item = Buffer.concat([Buffer.from([tickerBuf.length]), tickerBuf, addrBuf, decBuf, chainBuf, tokenSig]);
const itemLen = Buffer.alloc(4);
itemLen.writeUInt32BE(item.length);
const erc20Blob = Buffer.concat([itemLen, item]).toString("base64");
const erc20Path = join(ROOT, "server", "erc20-signatures.json");
writeFileSync(erc20Path, JSON.stringify({ [CHAIN_ID]: erc20Blob }, null, 2) + "\n");

console.log("chainId      :", CHAIN_ID);
console.log("contract     :", CONTRACT);
console.log("schemaHash   :", schemaHash);
console.log("static key   :", `${CHAIN_ID}:${CONTRACT}:${schemaHash}`);
console.log("fields       :", outFields.map((f) => `${f.label}(${f.format})`).join(", "));
console.log("wrote        :", outPath);
