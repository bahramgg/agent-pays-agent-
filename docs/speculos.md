# Real x402 signing with Speculos

By default this app uses a **simulated** signer, so it runs anywhere and the
Render deploy is unaffected. This page shows how to switch on **real** EIP-712
x402 signing by running the Ledger **Ethereum app** inside the **Speculos**
emulator and pointing the server at it.

When `USE_REAL_SIGNER=true`, `POST /api/sign` signs the real x402
`transferWithAuthorization` typed-data on Speculos by talking to it **directly
over HTTP APDU** (see `server/ledgerSigner.mjs`). We deliberately do **not** use
`@ledgerhq/hw-app-eth` or the signer-kit packages (ESM import bug under Node 24).
The only runtime dependency for real mode is `ethers`.

- APDU: `GET ADDRESS` = `e0 02 00 00 <Lc> <path>`; `SIGN EIP-712 (hashed)` =
  `e0 0c 00 00 <Lc> <path> <domainHash 32> <structHash 32>`.
- The signature is parsed as `v | r | s | 9000`, `v` is normalized to 27/28, and
  it is verified to recover to the Ledger address with `ethers.verifyTypedData`.

> Speculos uses its own well-known **test seed**. No real keys, no real funds,
> nothing secret is stored in this repo. Settlement stays simulated.

These steps are for **Ubuntu or Windows WSL2** with Docker.

---

## 1. Prerequisites

```bash
sudo apt-get update && sudo apt-get install -y docker.io
sudo usermod -aG docker "$USER"   # then log out/in once
node --version                    # 18+ (works on 24)
npm install                       # installs build tools + ethers (optional dep)
npm run build
```

If `ethers` did not get installed (it is an optional dependency), install it
explicitly for real mode:

```bash
npm install ethers
```

## 2. Get the Ethereum app binary (ELF)

Speculos runs a real Ledger app binary. Put an Ethereum app `.elf` for your
device model at `./apps/ethereum.elf`:

```bash
mkdir -p apps
# Download an Ethereum app build (for example Nano S Plus) and save it as
# apps/ethereum.elf -- see https://github.com/LedgerHQ/app-ethereum
ls -lh apps/ethereum.elf
```

## 3. Run Speculos (keep this terminal open)

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

- API + web UI: **http://localhost:5000** (open it in a browser to see the
  emulated screen and press its buttons).
- **Leave this terminal running the whole time.** Closing it stops the emulator.

Quick reachability check:

```bash
curl -s http://localhost:5000/events >/dev/null && echo "Speculos is reachable"
```

## 4. Enable Blind signing (required, one time)

The hashed EIP-712 signing call is gated behind the app's Blind signing setting.
In the Speculos web UI at http://localhost:5000:

1. From the Ethereum app home, press **right** to "Settings", press **both** to enter.
2. Open **Blind signing** and press **both** to set it to **Enabled**.
3. Press **right** to "Back", **both** to return to the app home.

If Blind signing is off you will get `SW=6985` or `6a80` (the server reports it).

## 5. Start the app in real-signer mode (second terminal)

```bash
USE_REAL_SIGNER=true SPECULOS_URL=http://localhost:5000 npm start
```

Open **http://localhost:3000**, play through the demo to the **Ledger Signer**
card, and press **Hold to sign**. The server sends the typed-data to Speculos.

Then **approve on Speculos** (in the web UI at http://localhost:5000): press
**right** through the screens to reach "Sign message" / "Approve", then press
**both** to confirm.

On success the card shows **SIGNED ON LEDGER** with the real signature hash and
"Signed by" the real Ledger address, and the bottom line says the EIP-712 x402
authorization was signed on a Ledger (Speculos) device. If Speculos is not
reachable, the card shows a friendly "signer unavailable" message and you can
try again. It never falls back to a fake signature in real mode.

## 6. Optional: reference script and direct API test

`sign-eip712.mjs` (project root) is the standalone reference: it builds the
transferWithAuthorization message, signs it on Speculos, and self-verifies with
ethers. Run it with Speculos up and approve on the device:

```bash
node sign-eip712.mjs
```

Or hit the server endpoint directly (approve on Speculos when prompted):

```bash
TERMS=$(curl -s http://localhost:3000/api/weather)
node -e '
  const t = JSON.parse(process.argv[1]).accepts[0];
  const td = { domain:{}, types:{}, primaryType:"TransferWithAuthorization",
    message:{ from:"0x0000000000000000000000000000000000000000", to:t.payTo, value:t.maxAmountRequired,
      validAfter:t.validAfter, validBefore:t.validBefore, nonce:t.nonce } };
  process.stdout.write(JSON.stringify({ typedData: td }));
' "$TERMS" > /tmp/sign-body.json
curl -s -X POST http://localhost:3000/api/sign -H 'Content-Type: application/json' --data @/tmp/sign-body.json
# -> { "authorization": {..., from: <ledger addr>}, "signature":"0x...", "v":27/28, "simulated":false, ... }
```

(The server forces `from` to the real Ledger address, so the signed
authorization is a valid x402 message.)

## 7. Back to simulated mode

Start without the env var (the default), exactly as before:

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
