# Agent Pays Agent

A **simulated** 8-bit pixel-art web demo showing two agents paying each other
via [x402](https://www.x402.org/), with the payment anchored by a Ledger
hardware signature. Built in the Base brand palette.

This demo is a friendly complement to x402 and Coinbase's onchain tooling. It
illustrates how agent-to-agent payments can feel when a hardware key signs the
final approval. Nothing here is "versus" anything.

> x402 makes agent payments fast and open. This demo adds one option: keep the
> signing key in hardware.

> **Everything in the demo is fake.** Simulated demo, no real funds, no real
> network. Addresses, nonce, signature, and transaction hash are placeholders.

---

## What it does

Press **RUN THE EXCHANGE** and the scene animates six beats, each with a
one-line caption, using stepped 8-bit motion:

1. **Request** - Agent A (the Buyer) sends `GET /weather` to Agent B (the Seller).
2. **402 Payment Required** - Agent B replies with a price: 0.01 USDC on Base.
3. **Build authorization** - Agent A assembles an EIP-3009
   `transferWithAuthorization` (EIP-712 typed data), shown as a pixel ticket.
4. **Hardware gate** (the star beat) - the authorization travels down to the
   Ledger device, the screen lights up `SIGN PAYMENT? 0.01 USDC -> Agent B`, and
   a button press stamps it with a flash, shake, and coin-clink. The key never
   leaves the device.
5. **Settle** - the signed authorization goes to a facilitator that settles on
   Base; a pixel block / checkmark appears.
6. **Deliver** - Agent B sends the weather back to Agent A.

**WHAT JUST HAPPENED?** expands a plain-language, readable (non-pixel-font)
breakdown of x402 plus hardware signing for newcomers.

Motion respects `prefers-reduced-motion` with a calmer, near-instant version.

## Tech

- **Node** static web server (`server.js`) - no framework, deployable anywhere.
- **TypeScript + esbuild** for the client bundle (`build.mjs`).
- **CSS variables** for the Base palette; `image-rendering: pixelated` for true
  hard-edged pixel art.
- **Mobile-first** layout: actors stack on phone, spread wide on laptop.
- Sprites are drawn from character grids onto canvases; movement uses the Web
  Animations API with `steps()` easing for an 8-bit feel.

## Project layout

```
src/
  index.html     # scene, controls, explanation, verdict, honesty tag
  styles.css     # Base palette + pixel-art style system (mobile-first)
  sprites.ts     # pixel-art sprite maps + canvas renderer
  flow.ts        # the six-beat animated exchange (state machine)
  main.ts        # entry: mount sprites + wire the flow
build.mjs        # esbuild: bundle + copy static assets -> dist/
server.js        # minimal Node static server (honors PORT)
render.yaml      # Render Blueprint for one-click deploy
```

## Run it locally

```bash
npm install      # install esbuild + typescript
npm run build    # bundle client + copy assets into dist/
npm start        # serve dist/ on http://localhost:3000
```

Then open **http://localhost:3000**. Set a custom port with `PORT=8080 npm start`.

> Shortcut: `npm run dev` builds and serves in one step.
> Type check: `npm run typecheck`.

## Deploy on Render

This repo ships a [`render.yaml`](./render.yaml) Blueprint, so it deploys like
any small Node web service:

1. Push this repo to GitHub.
2. In Render, choose **New > Blueprint** and point it at the repo.
3. Render runs `npm install && npm run build`, then `npm start`. It injects
   `PORT`, which the server reads automatically.

## What to check

- **Composition:** Agent A (Buyer) left, Agent B (Seller) right, Weather Oracle
  center, Ledger device bottom-center as the gate. Stacks cleanly on a phone,
  spreads wide on a laptop.
- **The flow:** RUN THE EXCHANGE plays all six beats with clear captions; the
  hardware gate flashes, shakes, and clinks; a block appears on settle.
- **Pixel rendering:** hard edges everywhere, no blur or soft gradients, at any
  zoom and on both phone and laptop.
- **Honesty + tone:** the verdict line, the friendly x402 line, and the
  "Simulated demo" tag are all visible; tone stays complementary to x402 and
  Coinbase; no em dashes in on-page copy.

## Brand palette

| Token       | Hex       | Use                            |
| ----------- | --------- | ------------------------------ |
| Base Blue   | `#0052FF` | Dominant background / accents  |
| White       | `#FFFFFF` | Sprite highlights, title text  |
| Near-black  | `#0A0B0D` | Outlines, tiles, hard shadows  |
