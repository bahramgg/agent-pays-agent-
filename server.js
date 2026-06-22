// Node web server for Agent Pays Agent.
// Serves the built static site from dist/ AND a tiny x402 API:
//   GET  /api/config   -> { useRealSigner }
//   GET  /api/weather  -> 402 + x402 terms, or 200 + forecast when paid
//   POST /api/sign     -> signs an EIP-712 message (SIMULATED for now)
//
// The 402 is a REAL HTTP 402 with real x402 payment terms. The EIP-712 message
// is really constructed on the client; signing is simulated here so the demo
// runs anywhere. Settlement is simulated. No real funds, no real network.
// Flip USE_REAL_SIGNER=true (Phase 4) to route signing to the Ledger Speculos
// emulator instead.
import { createHash, randomBytes } from "node:crypto";
import { createReadStream, existsSync, readFileSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { dirname, extname, join, normalize, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(import.meta.url));
const distDir = resolve(root, "dist");

const PORT = process.env.PORT || 3000;
const USE_REAL_SIGNER = process.env.USE_REAL_SIGNER === "true";
const SPECULOS_URL = process.env.SPECULOS_URL || "http://localhost:5000";

// --- Demo constants (realistic-looking, clearly fake) ----------------------
const NETWORK = "base";
const CHAIN_ID = 8453; // Base mainnet
const USDC = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913"; // USDC on Base
const SELLA_PAYTO = "0x9aB7…SELLA"; // fake seller address (display value)
// A checksummed-looking but fake payTo used inside the EIP-712 message.
const SELLA_PAYTO_FULL = "0x9aB7c4D2e1F0a3B5C6d7E8f90A1b2C3d4E5f6A7b";
const AMOUNT = "10000"; // 0.01 USDC (6 decimals)
const AMOUNT_HUMAN = "0.01 USDC";

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".map": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
};

// --- helpers ---------------------------------------------------------------
function sendJson(res, status, body, extraHeaders = {}) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    ...extraHeaders,
  });
  res.end(payload);
}

function readBody(req) {
  return new Promise((resolve) => {
    let data = "";
    req.on("data", (chunk) => {
      data += chunk;
      if (data.length > 1_000_000) req.destroy(); // basic guard
    });
    req.on("end", () => resolve(data));
    req.on("error", () => resolve(""));
  });
}

/** Build the x402 payment terms for the Weather Oracle resource. */
function buildPaymentTerms() {
  const nonce = "0x" + randomBytes(32).toString("hex");
  const validBefore = Math.floor(Date.now() / 1000) + 300; // 5 min expiry
  return {
    x402Version: 1,
    error: "payment required",
    accepts: [
      {
        scheme: "exact",
        network: NETWORK,
        chainId: CHAIN_ID,
        maxAmountRequired: AMOUNT,
        amountHuman: AMOUNT_HUMAN,
        resource: "/api/weather",
        description: "Weather Oracle: current forecast",
        mimeType: "application/json",
        payTo: SELLA_PAYTO_FULL,
        payToDisplay: SELLA_PAYTO,
        asset: USDC,
        maxTimeoutSeconds: 300,
        nonce,
        validAfter: "0",
        validBefore: String(validBefore),
        extra: { name: "USD Coin", version: "2" },
      },
    ],
  };
}

/** SIMULATED signer: deterministic, realistic-looking, clearly fake. */
function simulatedSign(typedData) {
  const json = JSON.stringify(typedData);
  const r = createHash("sha256").update("r:" + json).digest("hex");
  const s = createHash("sha256").update("s:" + json).digest("hex");
  const signature = "0x" + r + s + "1b"; // 65 bytes, v = 0x1b
  // The signer address equals the message's `from` (Buyo), as a real wallet would.
  const address = typedData?.message?.from ?? null;
  return { signature, address, simulated: true };
}

// --- API router ------------------------------------------------------------
async function handleApi(req, res, url) {
  if (url === "/api/config" && req.method === "GET") {
    return sendJson(res, 200, {
      useRealSigner: USE_REAL_SIGNER,
      network: NETWORK,
      // Public URL of the signer (Speculos web UI) so the user can approve from
      // a browser. Empty unless set (e.g. on the hosted Railway deploy).
      speculosPublicUrl: process.env.SPECULOS_PUBLIC_URL || "",
    });
  }

  if (url === "/api/weather" && req.method === "GET") {
    const payment = req.headers["x-payment"];
    if (!payment) {
      // REAL HTTP 402 with x402 terms.
      return sendJson(res, 402, buildPaymentTerms(), { "X-Payment-Required": "true" });
    }
    // A payment was presented. Validate shape (simulated verification).
    let parsed;
    try {
      parsed = JSON.parse(Buffer.from(payment, "base64").toString("utf8"));
    } catch {
      return sendJson(res, 400, { error: "invalid X-Payment header" });
    }
    const auth = parsed?.payload?.authorization;
    const sig = parsed?.payload?.signature;
    if (!auth || !sig || auth.value !== AMOUNT) {
      return sendJson(res, 402, { error: "payment invalid", ...buildPaymentTerms() });
    }
    // Simulated settlement on Base.
    const txHash =
      "0x" + createHash("sha256").update(sig + auth.nonce).digest("hex").slice(0, 40);
    return sendJson(
      res,
      200,
      {
        weather: {
          location: "Base City",
          summary: "Clear skies, light breeze",
          tempC: 21,
          updated: "just now",
        },
        settlement: {
          status: "settled",
          network: NETWORK,
          txHash,
          settledIn: "~2s",
          simulated: true,
        },
      },
      { "X-Payment-Response": Buffer.from(JSON.stringify({ txHash, simulated: true })).toString("base64") },
    );
  }

  if (url === "/api/sign" && req.method === "POST") {
    const raw = await readBody(req);
    let typedData;
    try {
      typedData = JSON.parse(raw).typedData;
    } catch {
      return sendJson(res, 400, { error: "invalid JSON body" });
    }
    if (!typedData?.message) {
      return sendJson(res, 400, { error: "missing typedData.message" });
    }
    if (USE_REAL_SIGNER) {
      // Real EIP-712 x402 CLEAR signing on the Ledger Speculos emulator (the
      // full message is streamed so the device shows the fields; see
      // server/ledgerSigner.mjs). Loaded lazily so the simulated build never
      // needs the Ledger SDK or Speculos. Any failure (for example Speculos not
      // running, or "Display raw messages" off) returns a clear error and never
      // falls back to a fake signature.
      try {
        const { signX402Authorization } = await import("./server/ledgerSigner.mjs");
        const result = await signX402Authorization(typedData.message);
        return sendJson(res, 200, result);
      } catch (err) {
        return sendJson(res, 502, {
          error: "ledger signer unavailable",
          detail: err && err.message ? err.message : String(err),
          speculosUrl: SPECULOS_URL,
        });
      }
    }
    return sendJson(res, 200, simulatedSign(typedData));
  }

  return sendJson(res, 404, { error: "not found" });
}

// --- static file serving ---------------------------------------------------
function serveStatic(req, res, urlPath) {
  let relPath = normalize(urlPath).replace(/^(\.\.[/\\])+/, "");
  if (relPath === "/" || relPath === "") relPath = "/index.html";
  let filePath = join(distDir, relPath);
  if (!existsSync(filePath) || !statSync(filePath).isFile()) {
    filePath = join(distDir, "index.html");
  }
  const type = MIME[extname(filePath)] || "application/octet-stream";
  res.writeHead(200, { "Content-Type": type });
  createReadStream(filePath).pipe(res);
}

// Serve the locally-signed ERC20 token-info blob so the Ledger SDK can render
// the x402 amount as "0.01 USDC". hw-app-eth fetches this from cryptoassetsBaseURL
// (set in server/ledgerSigner.mjs to this server). The blob is signed with the
// public test key, matching the CAL_TEST_KEY Speculos app -- no Ledger CAL.
function serveErc20Signatures(res, urlPath) {
  const m = urlPath.match(/^\/evm\/(\d+)\/erc20-signatures\.json$/);
  try {
    const all = JSON.parse(readFileSync(join(root, "server", "erc20-signatures.json"), "utf8"));
    const blob = m && all[m[1]];
    if (!blob) {
      res.writeHead(404);
      return res.end("");
    }
    res.writeHead(200, { "Content-Type": "text/plain" });
    return res.end(blob);
  } catch {
    res.writeHead(404);
    return res.end("");
  }
}

const server = createServer((req, res) => {
  const urlPath = decodeURIComponent((req.url || "/").split("?")[0]);
  if (urlPath.startsWith("/api/")) {
    handleApi(req, res, urlPath).catch(() => sendJson(res, 500, { error: "server error" }));
    return;
  }
  if (urlPath.startsWith("/evm/") && urlPath.endsWith("/erc20-signatures.json")) {
    return serveErc20Signatures(res, urlPath);
  }
  serveStatic(req, res, urlPath);
});

server.listen(PORT, () => {
  console.log(
    `Agent Pays Agent -- serving dist/ + x402 API on http://localhost:${PORT} ` +
      `(USE_REAL_SIGNER=${USE_REAL_SIGNER}` +
      (USE_REAL_SIGNER ? `, SPECULOS_URL=${SPECULOS_URL}` : "") +
      ")",
  );
});
