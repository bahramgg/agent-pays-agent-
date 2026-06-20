// Minimal static file server for the built site in dist/.
// No framework, no dependencies — just enough to serve one page on Render.
import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, normalize, resolve } from "node:path";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(import.meta.url));
const distDir = resolve(root, "dist");

// Render injects PORT; default to 3000 for local dev.
const PORT = process.env.PORT || 3000;

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

const server = createServer((req, res) => {
  // Strip query string and normalize to prevent path traversal.
  const urlPath = decodeURIComponent((req.url || "/").split("?")[0]);
  let relPath = normalize(urlPath).replace(/^(\.\.[/\\])+/, "");
  if (relPath === "/" || relPath === "") relPath = "/index.html";

  let filePath = join(distDir, relPath);

  // Fall back to index.html for unknown paths (single-page demo).
  if (!existsSync(filePath) || !statSync(filePath).isFile()) {
    filePath = join(distDir, "index.html");
  }

  const type = MIME[extname(filePath)] || "application/octet-stream";
  res.writeHead(200, { "Content-Type": type });
  createReadStream(filePath).pipe(res);
});

server.listen(PORT, () => {
  console.log(`Agent Pays Agent — serving dist/ on http://localhost:${PORT}`);
});
