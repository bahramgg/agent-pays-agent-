# Agent Pays Agent

The agent pays. The Ledger device signs. Built on x402 and the Ledger Agent
Stack.

An interactive pixel-art cartoon where two agents make a deal: **Buyo** (the
buyer) needs a forecast, **Sella** (the seller) runs a **Weather Oracle**, and
Buyo pays for one call over a real [x402](https://www.x402.org/) flow. You
advance the story by picking on-screen choices, and you approve the payment on a
branded **Ledger Signer** card that shows exactly what is being signed, then
press and hold to sign.

The UI is a tidy retro dashboard on a near-black page: white double-bordered
panels with a hard Base-blue card lift, monospace type, and a tab nav (How it
works / About / ?). The two characters are cute pixel **robots** (Buyo azure,
Sella teal) that **walk in from opposite edges** and meet before the dialogue.

This is a friendly complement to x402 and Coinbase's onchain tooling. It shows
how agent-to-agent payments can feel when the signing key lives in hardware.
Nothing here is "versus" anything.

> **Real 402, real EIP-712, real clear-sign signature (test seed), simulated
> settlement.** The HTTP 402 and its x402 terms are real (Base, USDC, amount,
> payTo, nonce, expiry). The EIP-712 `transferWithAuthorization` message is
> constructed for real. By default the signature is produced by a **simulated**
> signer so the demo runs anywhere; with `USE_REAL_SIGNER=true` it is a **real**
> EIP-712 clear-sign signature on the Ledger Speculos emulator (test seed, see
> below). Settlement is simulated. No real funds move.

---

## The story (seven beats)

1. **Meet** Buyo and Sella.
2. **402 Payment Required** comes back from the server with real x402 terms.
3. **Prepare** the EIP-712 `transferWithAuthorization` authorization.
4. **Clear-signing card and hold-to-sign:** a clean card lists exactly what is
   being signed (action, amount, recipient, network, nonce, valid-until) pulled
   from the real EIP-712 message. You press and hold to sign (or tap once under
   reduced motion). Reject cancels the payment. The signature appears as a short
   hash. The key never leaves the device.
5. **Settle** on Base (simulated), showing a transaction hash.
6. **Deliver** the forecast to Buyo.
7. **Wrap** up, with a "What just happened?" explainer.

## How the payment really works

- `GET /api/weather` with no payment returns a **real HTTP 402** plus x402 terms
  (`scheme`, `network`, `maxAmountRequired`, `payTo`, `asset` = USDC on Base,
  `nonce`, `validBefore`).
- The client constructs the **EIP-712 / EIP-3009 `transferWithAuthorization`**
  typed-data message from those terms.
- `POST /api/sign` signs the message. With `USE_REAL_SIGNER=false` (default) a
  **simulated** signer returns a realistic, clearly-fake signature. The browser
  never sees a private key.
- `GET /api/weather` is retried with the signed `X-Payment` header; the server
  performs a **simulated settlement** and returns the forecast.

The signer is behind one switch (`USE_REAL_SIGNER`). With it off (default), the
signature is simulated. With it **on**, `POST /api/sign` produces a **real**
EIP-712 x402 signature on the Ledger **Speculos** emulator with **curated clear
signing** -- the device shows **From / To / Amount "0.01 USDC"** and you approve
exactly what is signed; the signature is then verified to recover to the Ledger
address with `ethers`. `server/ledgerSigner.mjs` drives the official Ledger SDK
(`@ledgerhq/hw-app-eth`) over a tiny HTTP transport to Speculos.

### Clear signing with no Ledger CAL (fully local)

Curated clear signing normally needs a Ledger-signed ERC-7730 descriptor. The one
for Circle USDC `transferWithAuthorization` (x402) exists in
[Ledger's registry](https://github.com/LedgerHQ/clear-signing-erc7730-registry/blob/master/registry/circle/eip712-TransferWithAuthorization.json),
but its signed filters are served only behind a **gated CAL token** (every
unauthenticated fetch returns `Not Authorized` -- an auth gate, not geo-blocking).
So instead of depending on Ledger's CAL at runtime, this repo reproduces what
Ledger's own app/CI does for tests:

1. **Build a test-key Speculos app** with `CAL_TEST_KEY=1` so it trusts the
   **public** clear-signing test key (`cal.pem`) -- `infra/clearsign-app/build.sh`.
2. **Sign the filters + USDC token info ourselves** with that same public key --
   `infra/clearsign-app/gen-filters.mjs` emits `server/eip712-usdc-base-filters.json`
   and `server/erc20-signatures.json`.
3. The signer injects them via `staticEIP712SignaturesV2` and serves the token
   info locally, so **nothing hits Ledger's CAL: no gating token, no blind signing.**

This is a Speculos-only test-key app and is never used with real funds. The Ledger
SDK and `ethers` are optional dependencies loaded lazily, so the simulated build is
unaffected. If Speculos is unreachable in real mode, the UI shows a friendly error
and never fakes a signature. Full local steps:
[`docs/speculos.md`](./docs/speculos.md) and
[`infra/clearsign-app/README.md`](./infra/clearsign-app/README.md).

## Tech

- **Node** web server (`server.js`) -- serves the static site and the x402 API.
  No framework, no dependencies.
- **TypeScript + esbuild** for the client (`build.mjs`).
- **CSS variables** for the Base palette; `image-rendering: pixelated` for true
  hard-edged pixel art (no gradients, blur, or soft shadows).
- **Mobile-first**, playable in phone portrait, good on laptop.

## Project layout

```
src/
  index.html   # 3-panel layout (stage, dialogue+choices, clear-signing card)
  styles.css   # lavender retro dashboard + pixel-art style system + animations
  sprites.ts   # pixel-art robots (stand + walk frames), recolored per-robot
  actors.ts    # SpriteActor: drives an actor's stand / walk-cycle frames
  scene.ts     # the scene script: dialogue + choices + 5-step status (data)
  payment.ts   # x402 client: fetch 402, build EIP-712, sign, settle
  clearsign.ts # clear-signing card: readable fields + hold-to-sign
  engine.ts    # walk-in entrance, scene script, tabs, status, DOM wiring
  main.ts      # entry: start the engine
server.js      # static server + x402 API (/api/config, /api/weather, /api/sign)
server/
  ledgerSigner.mjs            # real clear signing on Speculos via hw-app-eth
  eip712-usdc-base-filters.json  # bundled filter descriptor (test-key signed)
  erc20-signatures.json          # bundled USDC token info (test-key signed)
infra/
  speculos/                   # Speculos Dockerfile + the built clear-signing app
  clearsign-app/              # build the CAL_TEST_KEY app + gen-filters.mjs + cal.pem
build.mjs      # esbuild: bundle + copy static assets -> dist/
docker-compose.yml  # one command: Speculos (test-key app) + the web app
render.yaml    # Render Blueprint (deploys the simulated demo)
```

## Run it locally

```bash
npm install
npm run build
npm start        # http://localhost:3000   (or: npm run dev)
```

Custom port: `PORT=8080 npm start`. Type check: `npm run typecheck`.

## Run real clear signing locally (Docker)

This signs on a real Ledger Ethereum app in the Speculos emulator, fully offline.

```bash
./infra/clearsign-app/build.sh   # once: build the CAL_TEST_KEY Speculos app
docker compose up                # Speculos + the web app
```

Then open `http://localhost:3000` (the app) and `http://localhost:5000` (the
Speculos device, where you approve). The device shows **From / To / Amount
"0.01 USDC"** -- no Ledger CAL, no gating token, no blind signing. Regenerate the
bundled filters with `node infra/clearsign-app/gen-filters.mjs`. See
[`docs/speculos.md`](./docs/speculos.md).

## Deploy on Render

The [`render.yaml`](./render.yaml) Blueprint deploys the **simulated** demo (the
cartoon + real 402 + EIP-712, with a simulated signature): **New > Blueprint**,
point it at the repo. Real clear signing needs the local Speculos build above and
does not run hosted.

## What to check

- **Refined retro UI on a near-black page:** white double-bordered panels with
  thin borders and a light Base-blue card lift (about half the previous weight),
  monospace headings/labels/buttons. No tab bar, no step box; the scene is always
  shown.
- **Title and subtitle:** "AGENT PAYS AGENT" with "The agent pays. The Ledger
  device signs. Built on x402 + the Ledger Agent Stack."
- **Robots:** Buyo (azure) and Sella (teal), cute limbed pixel robots that walk
  in from the edges and meet on a Base-blue stage. Reduced motion appears in place.
- **Ledger Signer card:** a clean header that simply reads "Ledger Signer" (no
  bracket mark, no CLEAR SIGNING sub-bar), then the human-readable fields (action,
  amount, recipient, network) from the real EIP-712 message; press and hold to
  sign produces a short signature hash; Reject leads to a friendly cancelled beat.
- **Bottom accordion:** a single box near the bottom with collapsible "How it
  works", "About", and "?" rows. Each expands on click. The Ledger Agent Stack
  copy (agent proposes, Ledger device signs) and the Ledger Device Management Kit
  and Ledger Ethereum Signer Kit are named inside.
- **Honesty at the very bottom:** the "Paid with x402..." wrap line and the
  subtle phase-aware note (signature simulated in this build, switches to the
  real-Ledger wording when `USE_REAL_SIGNER=true`) are the last thing on the page.
  The 402 and the EIP-712 message are real. Tone stays complementary to x402 and
  Coinbase. No em dashes.

## Brand palette

| Token       | Hex       | Use                              |
| ----------- | --------- | -------------------------------- |
| Base Blue   | `#0052FF` | Dominant stage / accents         |
| White       | `#FFFFFF` | Sprite faces, choices, title     |
| Near-black  | `#0A0B0D` | Outlines, device, dialogue box   |
