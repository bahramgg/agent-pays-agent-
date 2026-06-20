# Agent Pays Agent

A **simulated** 8-bit pixel-art web demo showing two agents paying each other
via [x402](https://www.x402.org/), with payments anchored by a Ledger hardware
signature. Built in the Base brand palette.

This demo is a friendly complement to x402 and Coinbase's onchain tooling — it
illustrates how agent-to-agent payments can feel when a hardware key signs the
final approval. Nothing here is "versus" anything; it's a visual love letter to
the stack.

> **Status: Phase 0 — skeleton & style system.**
> Right now this is just the look: the Base-blue screen, the pixel font, true
> pixel-art rendering, and one static agent sprite. No payment logic yet.

---

## Tech

- **Node** static web server (`server.js`) — no framework, deployable anywhere.
- **TypeScript + esbuild** for the client bundle (`build.mjs`).
- **CSS variables** for the Base palette; `image-rendering: pixelated` for
  true hard-edged pixel art.
- **Mobile-first** layout that reads well on both phone and laptop.

## Project layout

```
src/
  index.html     # page shell, loads fonts + sprite
  styles.css     # Base palette + pixel-art style system (mobile-first)
  main.ts        # draws the 16x16 agent sprite onto a canvas
build.mjs        # esbuild: bundles main.ts + copies static assets -> dist/
server.js        # minimal Node static server (honors PORT)
render.yaml      # Render Blueprint for one-click deploy
```

## Run it locally

```bash
npm install      # install esbuild + typescript
npm run build    # bundle client + copy assets into dist/
npm start        # serve dist/ on http://localhost:3000
```

Then open **http://localhost:3000**.

Set a custom port with `PORT=8080 npm start`.

> Shortcut: `npm run dev` runs the build and starts the server in one step.

Optional type check: `npm run typecheck`.

## Deploy on Render

This repo ships a [`render.yaml`](./render.yaml) Blueprint, so it deploys like
any small Node web service:

1. Push this repo to GitHub.
2. In Render, choose **New → Blueprint** and point it at the repo.
3. Render runs `npm install && npm run build`, then `npm start`. It injects
   `PORT`, which the server reads automatically.

## What to check in Phase 0

- The screen is dominated by **Base Blue (#0052FF)**.
- Title **"Agent Pays Agent"** renders in the pixel font (Press Start 2P).
- Subtitle reads **"x402 payments, anchored by hardware"**.
- The agent sprite has **hard pixel edges** — no blur, no soft gradients or
  shadows — at any zoom level.
- It looks crisp and reads well on **both** a phone and a laptop.

## Brand palette

| Token        | Hex       | Use                          |
| ------------ | --------- | ---------------------------- |
| Base Blue    | `#0052FF` | Dominant background / accents |
| White        | `#FFFFFF` | Sprite highlights, title text |
| Near-black   | `#0A0B0D` | Outlines, hard pixel shadows  |
