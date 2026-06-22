# Speculos app folder

`docker-compose.yml` mounts this folder into the Speculos container and loads
`ethereum.elf` from it.

That `.elf` is the Ledger Ethereum app for the emulator. It is gitignored;
produce it with the build script (or drop in a release build):

```bash
./infra/clearsign-app/build.sh
```

See [`../clearsign-app/README.md`](../clearsign-app/README.md) and
[`../../docs/speculos.md`](../../docs/speculos.md) for the full run steps and how
curated clear signing depends on a partner `originToken`.
