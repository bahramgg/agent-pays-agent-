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
EIP-712 x402 signature on the Ledger **Speculos** emulator through the
**Ledger Agent Stack (Device Management Kit)** -- the layer Ledger recommends.
`server/ledgerSigner.mjs` uses `@ledgerhq/device-management-kit` +
`@ledgerhq/device-transport-kit-speculos` (HTTP transport to Speculos) +
`@ledgerhq/device-signer-kit-ethereum` (`signTypedData`) +
`@ledgerhq/context-module` (clear-signing descriptors). The signature is verified
to recover to the Ledger address with `ethers`.

### Curated clear signing needs a partner originToken

Curated clear signing (the device showing **From / To / Amount "0.01 USDC"**)
relies on a Ledger-signed ERC-7730 descriptor that the Context Module fetches
from Ledger's CAL. Per Ledger's own
[agent skills](https://github.com/LedgerHQ/agent-skills), that fetch is unlocked
by a valid **partner `originToken`**:

> *"Without it ... the experience silently degrades to blind signing ... To
> obtain a token, enroll in Ledger's partner program."*

So set **`LEDGER_ORIGIN_TOKEN`** to a valid token (enroll at
[clear-signing/for-wallets](https://developers.ledger.com/docs/clear-signing/for-wallets))
and run where Ledger's CAL is reachable. The descriptor for Circle USDC
`transferWithAuthorization` (x402) already exists in
[Ledger's registry](https://github.com/LedgerHQ/clear-signing-erc7730-registry/blob/master/registry/circle/eip712-TransferWithAuthorization.json).
**Without a valid token (or if CAL is unreachable) the device shows raw fields /
blind signing -- this is Ledger's documented behavior, not a bug.**

The Ledger SDK and `ethers` are optional dependencies loaded lazily, so the
simulated build is unaffected. If Speculos is unreachable in real mode, the UI
shows a friendly error and never fakes a signature. Full local steps:
[`docs/speculos.md`](./docs/speculos.md).

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
  ledgerSigner.mjs   # real signing via the Ledger Agent Stack (DMK signTypedData)
infra/
  speculos/          # holds the built ethereum.elf that docker-compose loads
  clearsign-app/     # build.sh: build the Ethereum app for Speculos
build.mjs      # esbuild: bundle + copy static assets -> dist/
docker-compose.yml  # one command: Speculos + the web app (real signer)
render.yaml    # Render Blueprint (deploys the simulated demo)
```

## Run it locally

```bash
npm install
npm run build
npm start        # http://localhost:3000   (or: npm run dev)
```

Custom port: `PORT=8080 npm start`. Type check: `npm run typecheck`.

## Run real signing locally (Docker)

This signs on a real Ledger Ethereum app in the Speculos emulator through the DMK.

```bash
./infra/clearsign-app/build.sh   # once: build (or drop in) the Ethereum app .elf
LEDGER_ORIGIN_TOKEN=... docker compose up   # token optional; see below
```

Open `http://localhost:3000` (the app) and `http://localhost:5000` (the Speculos
device, where you approve). With a valid `LEDGER_ORIGIN_TOKEN` and CAL reachable,
the device shows the curated **From / To / Amount "0.01 USDC"**. Without a token
it shows raw fields / blind signing -- Ledger's documented behavior. See
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
