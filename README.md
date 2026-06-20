# Agent Pays Agent

An interactive pixel-art cartoon, in the Base palette, where two agents make a
deal: **Buyo** (the buyer) needs a service, **Sella** (the seller) provides it,
and Buyo pays over a real [x402](https://www.x402.org/) flow. You advance the
story by picking on-screen choices in dialogue bubbles. The payment is signed
on a recognizable pixel **Ledger Nano**.

This is a friendly complement to x402 and Coinbase's onchain tooling. It shows
how agent-to-agent payments can feel when the signing key lives in hardware.
Nothing here is "versus" anything.

> **Real signature, simulated settlement.** A later phase wires real EIP-712
> signing through the Ledger Ethereum Signer Kit and Speculos; on-chain
> settlement stays simulated. No real funds move.

---

> **Status: Phase 0 -- skeleton & style lock.**
> Right now this is only the look: the Base-blue stage, the pixel font, true
> pixel-art rendering, and one polished Buyo sprite doing a gentle idle bob.
> No dialogue, choices, or payment flow yet.

## Tech

- **Node** static web server (`server.js`) -- no framework, deployable anywhere.
- **TypeScript + esbuild** for the client bundle (`build.mjs`).
- **CSS variables** for the Base palette; `image-rendering: pixelated` for true
  hard-edged pixel art (no gradients, blur, or soft shadows).
- **Mobile-first** layout that stays crisp on phone and laptop.

## Project layout

```
src/
  index.html     # the stage: Buyo sprite + title + subtitle
  styles.css     # Base palette + pixel-art style system + idle-bob animation
  sprites.ts     # pixel-art sprite maps + canvas renderer (Buyo, 24x24)
  main.ts        # entry: mount the sprite
build.mjs        # esbuild: bundle main.ts + copy static assets -> dist/
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

## What to check in Phase 0

- The stage is dominated by **Base Blue (#0052FF)**.
- Title **"Agent Pays Agent"** renders in the pixel font (Press Start 2P).
- Subtitle reads **"Two agents, one x402 payment, signed on hardware."**
- **Buyo** is centered and doing a gentle, pixel-stepped **idle bob** (and holds
  still under `prefers-reduced-motion`).
- The sprite has **hard pixel edges** at any zoom: no blur, no soft gradients or
  shadows.
- It looks crisp and reads well on **both** a phone and a laptop.

## Brand palette

| Token       | Hex       | Use                            |
| ----------- | --------- | ------------------------------ |
| Base Blue   | `#0052FF` | Dominant stage / accents       |
| White       | `#FFFFFF` | Sprite face, title text        |
| Near-black  | `#0A0B0D` | Outlines, nameplate, shadows   |
