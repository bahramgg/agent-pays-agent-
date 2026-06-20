// Real EIP-712 signing via Ledger's official stack against a local Speculos
// emulator. This module is imported by server.js ONLY when USE_REAL_SIGNER=true,
// and every Ledger package is loaded with a dynamic import, so the app builds and
// runs (simulated) with none of these installed. No secrets live here: Speculos
// uses its own well-known test seed.
//
// Stack:
//   @ledgerhq/device-management-kit        -> DMK core
//   @ledgerhq/device-transport-kit-speculos-> connect DMK to Speculos over HTTP
//   @ledgerhq/device-signer-kit-ethereum   -> signTypedData(path, eip712)
//   @ledgerhq/speculos-device-controller   -> (optional) drive the emulator
//
// Reference pattern: @ledgerhq/ethereum-clear-signing-tester.

const DERIVATION_PATH = process.env.LEDGER_DERIVATION_PATH || "44'/60'/0'/0/0";
const APPROVE_TIMEOUT_MS = Number(process.env.SPECULOS_SIGN_TIMEOUT_MS || 60000);

// Cached DMK session so we do not reconnect on every request.
let session = null;

async function loadDeps() {
  // Dynamic imports: only resolved in real mode. A missing package surfaces as a
  // clear error rather than breaking the rest of the server.
  let dmkMod, ethMod, spxMod, rx;
  try {
    dmkMod = await import("@ledgerhq/device-management-kit");
    ethMod = await import("@ledgerhq/device-signer-kit-ethereum");
    spxMod = await import("@ledgerhq/device-transport-kit-speculos");
    rx = await import("rxjs");
  } catch (err) {
    throw new Error(
      "Ledger signer dependencies are not installed. Run the npm install command " +
        "in docs/speculos.md. Original error: " +
        (err && err.message ? err.message : String(err)),
    );
  }
  return { dmkMod, ethMod, spxMod, rx };
}

function resolveSpeculosTransport(spxMod) {
  // Different package versions export the factory under slightly different names.
  return (
    spxMod.speculosTransportFactory ||
    spxMod.SpeculosTransportFactory ||
    spxMod.default ||
    null
  );
}

async function connect(speculosUrl) {
  if (session) return session;

  const { dmkMod, ethMod, spxMod, rx } = await loadDeps();
  const { DeviceManagementKitBuilder } = dmkMod;
  const { SignerEthBuilder } = ethMod;
  const { firstValueFrom } = rx;

  const speculosTransportFactory = resolveSpeculosTransport(spxMod);
  if (!speculosTransportFactory) {
    throw new Error("Could not find the Speculos transport factory export.");
  }

  const dmk = new DeviceManagementKitBuilder()
    .addTransport(speculosTransportFactory({ speculosUrl }))
    .build();

  // Discover the single Speculos device and open a session.
  let device;
  try {
    device = await firstValueFrom(dmk.startDiscovering({}));
  } catch (err) {
    throw new Error(
      `No Speculos device found at ${speculosUrl}. Is Speculos running with the Ethereum app? ` +
        (err && err.message ? err.message : String(err)),
    );
  }
  const sessionId = await dmk.connect({ device });
  const signer = new SignerEthBuilder({ dmk, sessionId }).build();

  session = { dmk, sessionId, signer, rx, speculosUrl };
  return session;
}

function resetSession() {
  if (session?.dmk) {
    try {
      session.dmk.disconnect({ sessionId: session.sessionId });
    } catch {
      /* best effort */
    }
  }
  session = null;
}

/** Auto-approve on Speculos via its HTTP automation API (best effort). The user
 *  can also just press the buttons in the Speculos web UI at the same URL. */
async function armSpeculosAutoApprove(speculosUrl) {
  const automation = {
    version: 1,
    rules: [
      // Confirm screens: press both buttons.
      { text: "Approve", actions: [["button", 1, true], ["button", 2, true], ["button", 1, false], ["button", 2, false]] },
      { text: "Sign", actions: [["button", 1, true], ["button", 2, true], ["button", 1, false], ["button", 2, false]] },
      { text: "Hold", actions: [["button", 1, true], ["button", 2, true], ["button", 1, false], ["button", 2, false]] },
      // Everything else: press right to page forward.
      { regexp: ".*", actions: [["button", 2, true], ["button", 2, false]] },
    ],
  };
  try {
    await fetch(`${speculosUrl}/automation`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(automation),
    });
  } catch {
    /* automation is best effort; manual button presses in the UI also work */
  }
}

function assembleSignature(output) {
  // output is expected as { r, s, v } with r/s hex and v a number.
  const r = String(output.r || "").replace(/^0x/, "").padStart(64, "0");
  const s = String(output.s || "").replace(/^0x/, "").padStart(64, "0");
  const vNum = typeof output.v === "number" ? output.v : parseInt(String(output.v), 16);
  const vHex = (vNum >>> 0).toString(16).padStart(2, "0");
  return { signature: `0x${r}${s}${vHex}`, r: `0x${r}`, s: `0x${s}`, v: vNum };
}

async function runAction(rx, action) {
  // DMK device actions expose an observable that completes with a terminal state.
  const { lastValueFrom } = rx;
  const finalState = await lastValueFrom(action.observable);
  const status = finalState?.status;
  if (status === "error" || finalState?.error) {
    const e = finalState?.error;
    throw new Error("Device action failed: " + (e?.message || JSON.stringify(e) || status));
  }
  return finalState?.output;
}

async function withTimeout(promise, ms, label) {
  let t;
  const timeout = new Promise((_, reject) => {
    t = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    clearTimeout(t);
  }
}

/** Sign an EIP-712 typed-data message on Speculos and return a real signature. */
export async function signTypedDataOnSpeculos(typedData, { speculosUrl }) {
  let s;
  try {
    s = await connect(speculosUrl);
  } catch (err) {
    resetSession();
    throw new Error(
      `Cannot reach the Ledger Speculos emulator at ${speculosUrl}. ` +
        (err && err.message ? err.message : String(err)),
    );
  }

  try {
    // Real signer address (does not need on-screen confirmation).
    let address = null;
    try {
      const addrOut = await runAction(s.rx, s.signer.getAddress(DERIVATION_PATH, { checkOnDevice: false }));
      address = addrOut?.address ?? null;
    } catch {
      address = null; // address is non-critical for the UI
    }

    await armSpeculosAutoApprove(speculosUrl);

    const action = s.signer.signTypedData(DERIVATION_PATH, typedData);
    const output = await withTimeout(
      runAction(s.rx, action),
      APPROVE_TIMEOUT_MS,
      "Waiting for approval on Speculos",
    );
    if (!output || (!output.r && !output.signature)) {
      throw new Error("Speculos returned no signature.");
    }

    const sig = output.signature
      ? { signature: output.signature, r: output.r ?? null, s: output.s ?? null, v: output.v ?? null }
      : assembleSignature(output);

    return { ...sig, address, simulated: false, signer: "ledger-speculos" };
  } catch (err) {
    // A failed session is often unrecoverable; drop it so the next try reconnects.
    resetSession();
    throw err;
  }
}
