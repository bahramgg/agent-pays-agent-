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

> **Real 402, real EIP-712, simulated signature and settlement.**
> The HTTP 402 and its x402 terms are real (Base, USDC, amount, payTo, nonce,
> expiry). The EIP-712 `transferWithAuthorization` message is constructed for
> real. The signature is produced by a **simulated** signer so the demo runs
> anywhere, and settlement is simulated. No real funds move. A later phase flips
> `USE_REAL_SIGNER=true` to sign on the Ledger Speculos emulator.

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

The signer is behind one switch (`USE_REAL_SIGNER`) so Phase 4 can drop in the
Ledger Ethereum Signer Kit and the Speculos emulator without touching the story.

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
build.mjs      # esbuild: bundle + copy static assets -> dist/
render.yaml    # Render Blueprint for one-click deploy
```

## Run it locally

```bash
npm install
npm run build
npm start        # http://localhost:3000   (or: npm run dev)
```

Custom port: `PORT=8080 npm start`. Type check: `npm run typecheck`.

## Deploy on Render

This repo ships a [`render.yaml`](./render.yaml) Blueprint, so it deploys like
any small Node web service: **New > Blueprint**, point it at the repo. Render
runs `npm install && npm run build`, then `npm start`, and injects `PORT`.

## What to check

- **Retro UI on a near-black page:** white double-bordered panels with a hard
  Base-blue card lift, monospace headings/labels/buttons, a tab nav (How it works
  / About / ?), chunky raised buttons. There is no Demo tab and no step box; the
  scene is always shown.
- **Title and subtitle:** "AGENT PAYS AGENT" with "The agent pays. The Ledger
  device signs. Built on x402 + the Ledger Agent Stack."
- **Robots:** Buyo (azure) and Sella (teal), cute limbed pixel robots that walk
  in from the edges and meet on a Base-blue stage. Reduced motion appears in place.
- **Ledger Signer card:** a branded signing surface with a LEDGER header that
  lists exactly what is being signed (action, amount, recipient, network) from
  the real EIP-712 message; press and hold to sign produces a short signature
  hash; Reject leads to a friendly cancelled beat.
- **Ledger-forward copy:** the About and How it works sections explain the Ledger
  Agent Stack idea (the agent proposes, the Ledger device signs) and name the
  Ledger Device Management Kit and Ledger Ethereum Signer Kit. How it works lives
  at the bottom of the page.
- **Honesty:** the 402 is real; the EIP-712 message is real; the signature is
  simulated in this build and the subtle phase-aware note says so (it switches to
  the real-Ledger wording when `USE_REAL_SIGNER=true`). Tone stays complementary
  to x402 and Coinbase. No em dashes.

## Brand palette

| Token       | Hex       | Use                              |
| ----------- | --------- | -------------------------------- |
| Base Blue   | `#0052FF` | Dominant stage / accents         |
| White       | `#FFFFFF` | Sprite faces, choices, title     |
| Near-black  | `#0A0B0D` | Outlines, device, dialogue box   |
