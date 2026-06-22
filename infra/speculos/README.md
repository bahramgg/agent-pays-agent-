# Speculos app folder

`docker-compose.yml` mounts this folder into the Speculos container and loads
`ethereum-clearsign.elf` from it.

That `.elf` is the **test-key** Ledger Ethereum app used for local curated clear
signing. It is gitignored and produced by the build script:

```bash
./infra/clearsign-app/build.sh
```

See [`../clearsign-app/README.md`](../clearsign-app/README.md) for what it does
and [`../../docs/speculos.md`](../../docs/speculos.md) for the full run steps.
