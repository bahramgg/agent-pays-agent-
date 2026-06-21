# Speculos running the Ledger Ethereum app, for hosted real signing.
#
# Build context is THIS folder (infra/speculos), which must also contain your
# Ethereum app binary as `ethereum.elf` (see infra/speculos/README.md). The
# image serves the Speculos HTTP API AND the web UI (device screen + clickable
# buttons) on port 5000, so you can approve from any browser. No secrets here:
# Speculos uses its own well-known test seed.
FROM ghcr.io/ledgerhq/speculos:latest

# Your Ledger Ethereum app build. Provide it before building this image:
#   cp /path/to/ethereum.elf infra/speculos/ethereum.elf
COPY ethereum.elf /speculos/apps/ethereum.elf

# Speculos API + web UI port. On Railway, set the service's exposed/target port
# to 5000 (see docs/railway.md).
EXPOSE 5000

# The base image's entrypoint is `speculos`, so these are its arguments.
# --display headless = no desktop window; the web UI is served over HTTP.
CMD ["--model", "nanosp", "--display", "headless", "--api-port", "5000", "/speculos/apps/ethereum.elf"]
