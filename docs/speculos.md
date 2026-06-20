# Real Ledger signing with Speculos

By default this app uses a **simulated** signer, so it runs anywhere and the
Render deploy is unaffected. This page shows how to switch on **real** EIP-712
signing by running the Ledger **Ethereum app** inside the **Speculos** emulator
and pointing the server at it.

When `USE_REAL_SIGNER=true`, `POST /api/sign` signs the real
`transferWithAuthorization` typed-data on Speculos using Ledger's official stack:

- `@ledgerhq/device-management-kit` (DMK core)
- `@ledgerhq/device-transport-kit-speculos` (DMK to Speculos over HTTP)
- `@ledgerhq/device-signer-kit-ethereum` (`signTypedData`)
- `@ledgerhq/speculos-device-controller` (optional, to drive the emulator)

> Speculos uses its own well-known **test seed**. No real keys, no real funds,
> and nothing secret is stored in this repo. Settlement stays simulated.

These steps are written for **Ubuntu or Windows WSL2** with Docker.

---

## 1. Prerequisites

```bash
# Docker (Ubuntu)
sudo apt-get update && sudo apt-get install -y docker.io
sudo usermod -aG docker "$USER"   # then log out/in once

# Node 18+ and this repo already cloned and built
node --version
npm install
npm run build
```

## 2. Install the Ledger signing packages

These are optional dependencies (the simulated build does not need them), so
install them explicitly the first time:

```bash
npm install \
  @ledgerhq/device-management-kit \
  @ledgerhq/device-signer-kit-ethereum \
  @ledgerhq/device-transport-kit-speculos \
  @ledgerhq/speculos-device-controller \
  rxjs
```

## 3. Get the Ethereum app binary (ELF)

Speculos runs a real Ledger app binary. Put an Ethereum app `.elf` for your
chosen device model at `./apps/ethereum.elf`:

```bash
mkdir -p apps
# Download an Ethereum app build for your model (for example Nano S Plus) from
# Ledger's app-ethereum builds and save it as apps/ethereum.elf:
#   https://github.com/LedgerHQ/app-ethereum   (Releases / CI build artifacts)
# Then confirm it exists:
ls -lh apps/ethereum.elf
```

If you prefer, you can build it yourself with Ledger's
[`ledger-app-builder`](https://github.com/LedgerHQ/ledger-app-builder), but the
prebuilt `.elf` above is the fastest path.

## 4. Run Speculos (listens on port 5000)

```bash
docker run --rm -it \
  -p 5000:5000 \
  -v "$PWD/apps:/speculos/apps" \
  ghcr.io/ledgerhq/speculos:latest \
  --model nanosp \
  --display headless \
  --api-port 5000 \
  /speculos/apps/ethereum.elf
```

- The REST API and web UI are now at **http://localhost:5000**.
- Open that URL in a browser to watch the emulated screen and press its buttons.
- `--model` can be `nanos`, `nanosp`, `nanox`, `stax`, or `flex`.

Quick check that Speculos is up:

```bash
curl -s http://localhost:5000/events >/dev/null && echo "Speculos is reachable"
```

## 5. Start the app in real-signer mode

In a second terminal, from the repo root:

```bash
USE_REAL_SIGNER=true SPECULOS_URL=http://localhost:5000 npm start
```

Then open **http://localhost:3000** and play through the demo. At the Ledger
Signer card, press **Hold to sign**. The server sends the typed-data to Speculos
and signs it.

- The server tries to **auto-approve** on Speculos via its automation API. If it
  does not advance on its own, just press the buttons in the Speculos web UI at
  http://localhost:5000 to reach the approve screen and confirm.
- On success the card shows **SIGNED ON LEDGER** with the real signature hash,
  and the bottom line switches to "Signed on a real Ledger emulator."
- If Speculos is not reachable, the card shows a friendly "signer unavailable"
  message and you can try again. The app never falls back to a fake signature in
  real mode.

## 6. Optional: direct API smoke test

With Speculos running and the server in real mode, you can sign a sample message
directly. Approve it on the Speculos screen when prompted:

```bash
# Get real x402 terms from the running app, build the EIP-712 message, and sign:
TERMS=$(curl -s http://localhost:3000/api/weather)
node -e '
  const t = JSON.parse(process.argv[1]).accepts[0];
  const td = {
    domain: { name: t.extra.name, version: t.extra.version, chainId: t.chainId, verifyingContract: t.asset },
    types: { TransferWithAuthorization: [
      {name:"from",type:"address"},{name:"to",type:"address"},{name:"value",type:"uint256"},
      {name:"validAfter",type:"uint256"},{name:"validBefore",type:"uint256"},{name:"nonce",type:"bytes32"}
    ]},
    primaryType: "TransferWithAuthorization",
    message: { from:"0x4C2a1bE73D9f8A0c1B2d3E4F5a6B7c8D9e0F1A2b", to:t.payTo, value:t.maxAmountRequired,
               validAfter:t.validAfter, validBefore:t.validBefore, nonce:t.nonce }
  };
  process.stdout.write(JSON.stringify({ typedData: td }));
' "$TERMS" > /tmp/sign-body.json

curl -s -X POST http://localhost:3000/api/sign \
  -H 'Content-Type: application/json' \
  --data @/tmp/sign-body.json
# -> { "signature": "0x...", "r": "0x...", "s": "0x...", "v": 27/28, "simulated": false, ... }
```

## 7. Back to simulated mode

Just start without the env var (the default), exactly as before:

```bash
npm start
```

Render uses this default, so the deploy keeps using the simulated signer and is
unaffected by anything on this page.

## Environment variables

| Variable                  | Default                 | Meaning                                  |
| ------------------------- | ----------------------- | ---------------------------------------- |
| `USE_REAL_SIGNER`         | `false`                 | `true` signs on Speculos; else simulated |
| `SPECULOS_URL`            | `http://localhost:5000` | Where Speculos is listening              |
| `LEDGER_DERIVATION_PATH`  | `44'/60'/0'/0/0`        | Derivation path used for signing         |
| `SPECULOS_SIGN_TIMEOUT_MS`| `60000`                 | How long to wait for on-device approval  |
