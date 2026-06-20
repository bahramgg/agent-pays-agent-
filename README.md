# Agent Pays Agent

An interactive pixel-art cartoon where two agents make a deal: **Buyo** (the
buyer) needs a forecast, **Sella** (the seller) runs a **Weather Oracle**, and
Buyo pays for one call over a real [x402](https://www.x402.org/) flow. You
advance the story by picking on-screen choices, and you approve the payment on a
clean **clear-signing card** that shows exactly what is being signed, then press
and hold to sign.

The UI is a tidy retro dashboard: a light lavender page, white double-bordered
panels with a hard card lift, monospace type, a tab nav, and a status step line.
The two characters are cute, recolored pixel **robots** (Buyo azure, Sella teal)
that **walk in from opposite edges** and meet in the middle before the dialogue
begins.

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

- **Retro UI:** a light lavender page with white double-bordered panels, a hard
  card lift, monospace headings/labels/buttons, a tab nav (Demo / How it works /
  About / ?), and chunky raised buttons with a pressed state. Base Blue is the
  brand accent (active tab, primary buttons, the stage).
- **Three stacked panels:** the robot stage on top, dialogue plus choices in the
  middle, and the clear-signing card at the bottom.
- **Robots:** Buyo (azure) and Sella (teal) are cute limbed pixel robots (head,
  body, arms, legs), standing free on a Base-blue stage with a ground line.
- **Entrance:** they walk in from the left and right edges with a stepped walk
  cycle (arms and legs animate) and meet in the middle. Reduced motion makes
  them appear in place.
- **Status line:** an always-visible "STEP X OF 5" indicator updates through
  meet, request, 402, review and sign, settle, deliver.
- **Clear-signing card:** lists exactly what is being signed (action, amount,
  recipient, network, nonce, valid-until) from the real EIP-712 message; press
  and hold to sign produces a short signature hash; Reject leads to a friendly
  cancelled beat.
- **Flow and honesty:** the 402 is real (watch the network tab); the How it works
  and About tabs read clearly; the wrap line and honesty tag say the signature is
  simulated; tone stays complementary to x402 and Coinbase; no em dashes.

## Brand palette

| Token       | Hex       | Use                              |
| ----------- | --------- | -------------------------------- |
| Base Blue   | `#0052FF` | Dominant stage / accents         |
| White       | `#FFFFFF` | Sprite faces, choices, title     |
| Near-black  | `#0A0B0D` | Outlines, device, dialogue box   |
