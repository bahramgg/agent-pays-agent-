# Speculos service (hosted real signing)

This folder builds a container that runs the Ledger **Ethereum app** inside
**Speculos**, exposing both the HTTP APDU API and the web UI (device screen +
buttons) on port `5000`. The deployed app talks to it for real signing, and you
approve each signature from your browser.

## You must provide the app binary

This image needs a Ledger Ethereum app `.elf`. It is not committed here. Copy the
one you already use locally into this folder as `ethereum.elf`:

```bash
cp /path/to/your/ethereum.elf infra/speculos/ethereum.elf
```

(See `docs/speculos.md` for where to get the `.elf`.) Commit it so the platform
can build the image, or upload it as part of your deploy.

## Build / run locally (optional sanity check)

```bash
cd infra/speculos
docker build -t apa-speculos .
docker run --rm -it -p 5000:5000 apa-speculos
# open http://localhost:5000 -> enable Blind signing once (Settings)
```

Full hosted setup (Railway, two services, browser approval) is in
[`../../docs/railway.md`](../../docs/railway.md).
