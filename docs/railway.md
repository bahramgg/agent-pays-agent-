# Hosted real signing on Railway (no local machine)

This sets up the demo so that **everything runs in the cloud**: the website and
the Ledger **Speculos** emulator both run on Railway, they talk to each other,
and you approve each signature from your **browser**. No laptop or local Speculos
needed.

You run two Railway services in one project:

1. **speculos** - the Ledger Ethereum app inside Speculos (Docker). Its web UI
   (device screen + buttons) is public, so you can approve from any browser.
2. **web** - this Node app, set to real-signer mode, pointing at the speculos
   service.

> Honesty: this still signs with the Speculos **test seed**. There are no real
> funds, and settlement stays simulated. Only the EIP-712 x402 signature is real.
> With real mode on, the signer is public, so only approve requests you started.

---

## 0. Provide the Ethereum app binary

The speculos image needs a Ledger Ethereum app `.elf`. Copy the one you use
locally into the repo and commit it:

```bash
cp /path/to/your/ethereum.elf infra/speculos/ethereum.elf
git add infra/speculos/ethereum.elf && git commit -m "add ethereum.elf for hosted speculos"
git push
```

(See `docs/speculos.md` for where to get the `.elf`.)

## 1. Create the project and the speculos service

1. In Railway, **New Project -> Deploy from GitHub repo**, pick this repo.
2. On the created service, open **Settings**:
   - **Root Directory:** `infra/speculos`
   - **Build:** it will use `infra/speculos/Dockerfile` automatically.
   - **Networking ->** set the **target port** to `5000`, and click
     **Generate Domain** to get a public URL (you will approve here).
3. Rename this service to **speculos** (Settings -> Service name).
4. Deploy. Note two things from this service:
   - its **public URL**, for example `https://speculos-production.up.railway.app`
   - its **private hostname**, shown as `RAILWAY_PRIVATE_DOMAIN`, for example
     `speculos.railway.internal`

## 2. Enable clear signing on the hosted device (one time)

We stream the full EIP-712 message so the device shows the actual fields (to,
value, nonce, ...) and you approve exactly what is signed. That is clear
signing, not blind signing. The app gates it behind the **"Display raw
messages"** setting (verbose EIP-712), so turn that on (Blind signing is **not**
needed).

Open the speculos **public URL** in a browser. On the emulated device:

1. Press **right** to "Settings", press **both** to enter.
2. Open **Display raw messages**, press **both** to set **Enabled**.
3. Press **right** to "Back", **both** to return to the app home.

Note: a redeploy or restart of the speculos service resets this, so re-enable it
after any redeploy.

## 3. Add the web service

1. In the same project, **New -> GitHub repo** (same repo) to add a second
   service. Rename it to **web**.
2. **Settings:**
   - **Root Directory:** repo root (leave blank/`/`).
   - **Build command:** `npm install && npm run build`
   - **Start command:** `npm start`
3. **Variables** (Environment):
   - `USE_REAL_SIGNER` = `true`
   - `SPECULOS_URL` = `http://speculos.railway.internal:5000`
     (use the speculos service's private hostname from step 1, port 5000)
   - `SPECULOS_PUBLIC_URL` = the speculos **public URL** from step 1
4. Click **Generate Domain** for the web service. Deploy.

## 4. Run it

1. Open the **web** public URL and play to the **Ledger Signer** card.
2. Press **Hold to sign**. The card switches to **AWAITING APPROVAL** and shows
   an **"Open the signer to approve"** link (that is your speculos public URL).
3. Open it. The device shows the EIP-712 fields (to, value, nonce, ...): scroll
   through them with **right**, review, then **both** on "Approve".
4. The real signature appears back on the web app, the card shows **SIGNED ON
   LEDGER** with the signer address, and the wrap line says it was signed on a
   Ledger (Speculos) device.

## Notes

- **It is all hosted.** Your laptop can be off. The signer lives on Railway and
  you approve from any browser, even your phone.
- **Test seed, no real funds.** Settlement is simulated; nothing is broadcast.
- **Public signer.** With real mode on, anyone with the web URL can trigger a
  sign request that you then approve. Approve only your own, and switch
  `USE_REAL_SIGNER` to `false` on the web service when you are done.
- **The "Display raw messages" setting resets** on a speculos redeploy; re-enable
  it (step 2). To stop redeploys from resetting it, set the speculos service's
  **Watch Paths** to `infra/speculos/**` so app pushes do not rebuild it.
- **Free tiers sleep / are resource limited.** Speculos uses CPU; if the
  speculos service is slow or sleeps, the first sign may lag or time out
  (`SPECULOS_SIGN_TIMEOUT_MS`, default 120s). A small paid instance is steadier.
- If the web service cannot reach speculos, the card shows a friendly error and
  never fakes a signature. Double-check `SPECULOS_URL` (private hostname + port
  5000) and that the speculos service is running.

## Back to simulated

On the **web** service, set `USE_REAL_SIGNER` to `false` (or remove it). The site
returns to the simulated signer and the speculos service is no longer used.
