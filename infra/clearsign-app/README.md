# Custom clear-signing Ethereum app (test key)

This builds a Ledger Ethereum app `.elf` for Speculos that verifies clear-signing
filters against the **public test key** (`app-ethereum/.../keychain/cal.pem`)
instead of Ledger's production CAL key.

## Why this exists

The x402 USDC `TransferWithAuthorization` clear-signing descriptor is real and
lives in Ledger's registry (`registry/circle/eip712-TransferWithAuthorization.json`),
with the curated display **From / To / Amount = "0.01 USDC"**. But the *signed*
filters are served only by Ledger's CAL behind a **gating token** (that is why
every fetch returns `Not Authorized`, regardless of network or VPN -- it is an
auth gate, not geo-blocking).

Ledger's own app/CI solves the same problem with a **test key**: the app source
has `HAVE_CAL_TEST_KEY`, and `cal.pem` (whose public key matches that constant)
is published in app-ethereum. So we:

1. Build the app with `CAL_TEST_KEY=1` -> it trusts `cal.pem`.
2. Sign the x402 USDC filters ourselves with `cal.pem` (see the generator, next
   stage).
3. The device shows the curated view. **No CAL, no token, no blind signing.**

This is for the Speculos emulator only. It is a TEST-KEY build and must never be
used with real funds.

## Build it

From the repo root, with Docker running:

```bash
./infra/clearsign-app/build.sh
```

This writes `infra/speculos/ethereum-clearsign.elf`, which `docker-compose.yml`
loads into Speculos. Override the pinned source with `APP_ETHEREUM_REF=...`.
