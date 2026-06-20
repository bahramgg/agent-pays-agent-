// Build script: bundles the client TypeScript and copies static assets into dist/.
// Keep this intentionally small — it scales to later phases by just adding entry points.
import { build } from "esbuild";
import { cp, mkdir, rm } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(import.meta.url));
const dist = resolve(root, "dist");

async function run() {
  // Start from a clean output directory so stale files never linger.
  await rm(dist, { recursive: true, force: true });
  await mkdir(dist, { recursive: true });

  // Bundle + minify the client entry point.
  await build({
    entryPoints: [resolve(root, "src/main.ts")],
    bundle: true,
    minify: true,
    sourcemap: true,
    format: "esm",
    target: ["es2020"],
    outfile: resolve(dist, "main.js"),
    logLevel: "info",
  });

  // Copy the static shell (HTML + CSS) verbatim.
  await cp(resolve(root, "src/index.html"), resolve(dist, "index.html"));
  await cp(resolve(root, "src/styles.css"), resolve(dist, "styles.css"));

  console.log("Build complete -> dist/");
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
