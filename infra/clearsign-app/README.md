# Build the Speculos Ethereum app

`docker-compose.yml` mounts this folder's parent (`infra/speculos`) into the
Speculos container and loads `ethereum.elf` from it. That `.elf` is gitignored;
produce it once with:

```bash
./infra/clearsign-app/build.sh
```

This builds the standard Ledger Ethereum app from source for the Nano S+ target.
You can instead download a release `.elf` from
[app-ethereum releases](https://github.com/LedgerHQ/app-ethereum/releases) and
save it as `infra/speculos/ethereum.elf`.

Signing then goes through the Ledger Agent Stack (DMK) -- see
[`../../docs/speculos.md`](../../docs/speculos.md). Curated clear signing
(From / To / "0.01 USDC") needs a valid partner `originToken`
(`LEDGER_ORIGIN_TOKEN`) and Ledger's CAL reachable; without it the device shows
raw fields / blind signing, which is Ledger's documented behavior.
