# Real x402 signing with Speculos (Ledger Agent Stack / DMK)

By default this app uses a **simulated** signer, so it runs anywhere. With
`USE_REAL_SIGNER=true`, `POST /api/sign` signs the real x402
`transferWithAuthorization` typed data on the Ledger **Ethereum app** inside the
**Speculos** emulator, through the **Ledger Agent Stack**:

- `@ledgerhq/device-management-kit` (DMK core)
- `@ledgerhq/device-transport-kit-speculos` (HTTP transport to Speculos)
- `@ledgerhq/device-signer-kit-ethereum` (`signTypedData`)
- `@ledgerhq/context-module` (clear-signing descriptor resolution)

The signature is verified to recover to the Ledger address with `ethers`.

> Speculos uses its own well-known **test seed**. No real keys, no real funds,
> nothing secret in this repo. Settlement stays simulated.

## Curated clear signing requires a partner originToken

The device shows curated fields (**From / To / Amount "0.01 USDC"**) only when
the Context Module can fetch the Ledger-signed ERC-7730 descriptor from CAL, and
that fetch is unlocked by a valid **partner `originToken`**. From Ledger's own
[agent skills](https://github.com/LedgerHQ/agent-skills):

> *"`originToken` ... without it, the device shows raw hex -- the experience
> silently degrades to blind signing ... To obtain a token, enroll in Ledger's
> partner program."*

So:

- **With** a valid `LEDGER_ORIGIN_TOKEN` (enroll at
  [clear-signing/for-wallets](https://developers.ledger.com/docs/clear-signing/for-wallets))
  **and** Ledger's CAL reachable -> curated clear signing.
- **Without** a token, or where CAL is blocked -> the device shows raw fields /
  blind signing. This is Ledger's documented behavior, not a bug in this app.

The descriptor for Circle USDC `transferWithAuthorization` (x402) already exists
in [Ledger's registry](https://github.com/LedgerHQ/clear-signing-erc7730-registry/blob/master/registry/circle/eip712-TransferWithAuthorization.json).

---

## Run it (Docker)

On **Ubuntu or Windows WSL2** with Docker:

```bash
# 1. Build (or download) the Ledger Ethereum app .elf for Speculos.
./infra/clearsign-app/build.sh
#    or: download a release .elf and save it as infra/speculos/ethereum.elf
#    from https://github.com/LedgerHQ/app-ethereum/releases

# 2. Run Speculos + the web app. Pass a token to get the curated view.
LEDGER_ORIGIN_TOKEN=your-token docker compose up
```

- App: **http://localhost:3000** -- play to the **Ledger Signer** card, press
  **Hold to sign**.
- Device: **http://localhost:5000** -- scroll with **right**, then **both** on
  Approve.

On success the card shows the real signature and the Ledger signer address; if
Speculos is unreachable it shows a friendly error and never fakes a signature.

## Manual run (without docker compose)

```bash
# Speculos with the app (keep this terminal open):
docker run --rm -it -p 5000:5000 \
  -v "$PWD/infra/speculos:/apps" \
  ghcr.io/ledgerhq/speculos:latest \
  --model nanosp --display headless --api-port 5000 /apps/ethereum.elf

# In a second terminal:
USE_REAL_SIGNER=true SPECULOS_URL=http://localhost:5000 \
  LEDGER_ORIGIN_TOKEN=your-token npm run dev
```

## Back to simulated mode

Start without `USE_REAL_SIGNER` (the default): `npm start` (or `npm run dev`).
No Speculos, no Docker needed.

## Environment variables

| Variable                      | Default                 | Meaning                                              |
| ----------------------------- | ----------------------- | ---------------------------------------------------- |
| `USE_REAL_SIGNER`             | `false`                 | `true` signs on Speculos via the DMK; else simulated |
| `SPECULOS_URL`                | `http://localhost:5000` | Where Speculos is listening                          |
| `LEDGER_ORIGIN_TOKEN`         | _(unset)_               | Partner token that unlocks curated clear signing     |
| `CAL_MIRROR_URL`              | _(unset)_               | Point the Context Module at a CAL mirror             |
| `LEDGER_DERIVATION_PATH`      | `44'/60'/0'/0/0`        | Derivation path used for signing                     |
| `SPECULOS_ADDRESS_TIMEOUT_MS` | `12000`                 | Timeout for device discovery / address read          |
