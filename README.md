# Agent Pays Agent

An interactive pixel-art cartoon, in the Base palette, where two agents make a
deal: **Buyo** (the buyer) needs a forecast, **Sella** (the seller) runs a
**Weather Oracle**, and Buyo pays for one call over a real
[x402](https://www.x402.org/) flow. You advance the story by picking on-screen
choices in dialogue bubbles, and you approve the payment by reviewing it page by
page and holding to sign on a recognizable pixel **Ledger Stax**.

Buyo and Sella **walk in from opposite edges** with a stepped 8-bit walk cycle
and meet in the middle before the dialogue begins.

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
4. **Ledger Stax review and hold-to-sign:** the white touchscreen shows the
   payment across paged review screens ("1 of 3" to "3 of 3"), and you press and
   hold to sign (or tap once under reduced motion). Reject cancels the payment.
   A signature appears as a short hash. The key never leaves the device.
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
  index.html   # stage (Buyo, Sella, Ledger Stax), dialogue, choices, explainer
  styles.css   # Base palette + pixel-art style system + animations
  sprites.ts   # pixel-art sprites: robots (stand + walk frames), Ledger mark
  actors.ts    # SpriteActor: drives an actor's stand / walk-cycle frames
  scene.ts     # the scene script: 7 beats of dialogue + choices (data)
  payment.ts   # x402 client: fetch 402, build EIP-712, sign, settle
  ledger.ts    # Ledger Stax paged review + hold-to-sign component
  engine.ts    # walk-in entrance, scene script, DOM, Stax review wiring
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

- **Entrance:** Buyo and Sella walk in from the edges (stepped legs) and meet in
  the middle before the dialogue starts. Reduced motion makes them appear in place.
- **Scene:** Buyo left, Sella right, a recognizable pixel **Ledger Stax**
  (charcoal body, side button, large white screen, silver bottom bar with the
  Ledger mark) as the gate. Plays well in phone portrait, looks good on laptop.
- **Flow:** the seven beats play; the 402 is real (watch the network tab); the
  Stax shows the paged review; press and hold to sign produces a short signature
  hash; Reject leads to a friendly cancelled beat.
- **Explainer and honesty (Phase 3):** "What just happened?" reads clearly in a
  non-pixel font; the wrap line and the honesty tag are visible and currently
  say the signature is simulated; tone stays complementary to x402 and Coinbase;
  no em dashes in on-page copy.

## Brand palette

| Token       | Hex       | Use                              |
| ----------- | --------- | -------------------------------- |
| Base Blue   | `#0052FF` | Dominant stage / accents         |
| White       | `#FFFFFF` | Sprite faces, choices, title     |
| Near-black  | `#0A0B0D` | Outlines, device, dialogue box   |
