# Real x402 clear signing with Speculos (local, no Ledger CAL)

By default this app uses a **simulated** signer, so it runs anywhere. This page
shows how to switch on **real** EIP-712 x402 clear signing on the Ledger
**Ethereum app** inside the **Speculos** emulator -- fully local and offline.

With `USE_REAL_SIGNER=true`, `POST /api/sign` signs the real x402
`transferWithAuthorization` typed data on Speculos through the official Ledger SDK
(`@ledgerhq/hw-app-eth`) over a tiny HTTP-APDU transport (`server/ledgerSigner.mjs`).
The device shows a **curated** view -- **From / To / Amount "0.01 USDC"** -- and
you approve exactly what is signed. The signature is verified to recover to the
Ledger address with `ethers`.

> Speculos uses its own well-known **test seed**, and the app below is a
> **test-key** build for the emulator only. No real keys, no real funds, nothing
> secret in this repo. Settlement stays simulated.

## Why a custom app?

Curated clear signing needs a Ledger-signed ERC-7730 descriptor. The one for
Circle USDC `transferWithAuthorization` (x402) exists in
[Ledger's registry](https://github.com/LedgerHQ/clear-signing-erc7730-registry/blob/master/registry/circle/eip712-TransferWithAuthorization.json),
but its signed filters are served only behind a **gated CAL token** -- every
unauthenticated fetch returns `Not Authorized` (an auth gate, not geo-blocking),
so no VPN helps. Instead we do exactly what Ledger's own app/CI does for tests:
build the app so it trusts the **public** clear-signing test key (`cal.pem`), and
sign the filters + USDC token info ourselves with that key. Nothing hits Ledger's
CAL at runtime; no gating token; no blind signing. See
[`infra/clearsign-app/README.md`](../infra/clearsign-app/README.md).

---

## Quick start (Docker, one command set)

On **Ubuntu or Windows WSL2** with Docker:

```bash
# 1. Build the test-key Speculos Ethereum app (once; takes a few minutes).
./infra/clearsign-app/build.sh

# 2. Run Speculos (with that app) + the web app.
docker compose up
```

- App: **http://localhost:3000** -- play to the **Ledger Signer** card, press
  **Hold to sign**.
- Device: **http://localhost:5000** -- the Speculos screen. Scroll the curated
  fields with **right**, reach "Sign / Approve", then press **both** to confirm.

On success the card shows the real signature and the Ledger signer address; if
Speculos is unreachable it shows a friendly error and never fakes a signature.

## How the pieces fit

| Piece | What it does |
|---|---|
| `infra/clearsign-app/build.sh` | Builds `app-ethereum` with `CAL_TEST_KEY=1` -> `infra/speculos/ethereum-clearsign.elf` (trusts `cal.pem`). Also patches the review title. |
| `infra/clearsign-app/gen-filters.mjs` | Signs the EIP-712 filters + USDC token info with `cal.pem` -> `server/eip712-usdc-base-filters.json` + `server/erc20-signatures.json`. |
| `server/ledgerSigner.mjs` | Streams the message + bundled filters to Speculos via `hw-app-eth`; `staticEIP712SignaturesV2` + a local `cryptoassetsBaseURL`, so no CAL fetch. |
| `docker-compose.yml` | Runs Speculos (the test-key app) + the web app in real-signer mode. |

Regenerate the bundled descriptors after changing the message/fields:

```bash
node infra/clearsign-app/gen-filters.mjs
```

## Manual run (without docker compose)

```bash
# Speculos with the built app (keep this terminal open):
docker run --rm -it -p 5000:5000 \
  -v "$PWD/infra/speculos:/apps" \
  ghcr.io/ledgerhq/speculos:latest \
  --model nanosp --display headless --api-port 5000 /apps/ethereum-clearsign.elf

# In a second terminal:
USE_REAL_SIGNER=true SPECULOS_URL=http://localhost:5000 npm run dev
```

## Back to simulated mode

Start without the env var (the default): `npm start` (or `npm run dev`). The
simulated signer needs no Speculos and no Docker.

## Environment variables

| Variable                      | Default                         | Meaning                                            |
| ----------------------------- | ------------------------------- | -------------------------------------------------- |
| `USE_REAL_SIGNER`             | `false`                         | `true` signs on Speculos; else simulated           |
| `SPECULOS_URL`                | `http://localhost:5000`         | Where Speculos is listening                        |
| `CRYPTOASSETS_BASE_URL`       | `http://localhost:<PORT>`       | Where the SDK fetches the local USDC token info    |
| `LEDGER_DERIVATION_PATH`      | `44'/60'/0'/0/0`                | Derivation path used for signing                   |
| `SPECULOS_SIGN_TIMEOUT_MS`    | `120000`                        | How long to wait for on-device approval            |
| `SPECULOS_ADDRESS_TIMEOUT_MS` | `10000`                         | Timeout for the (instant) address read             |
