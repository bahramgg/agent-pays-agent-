#!/usr/bin/env bash
# Build the standard Ledger Ethereum app (.elf) for Speculos, so the local demo
# can sign through the Ledger Agent Stack (DMK). This is the normal app that
# trusts Ledger's PRODUCTION clear-signing key -- curated clear signing then
# depends on a valid partner originToken + Ledger's CAL at runtime (see
# LEDGER_ORIGIN_TOKEN in docker-compose.yml and docs/speculos.md).
#
# You can also just download a release .elf from
# https://github.com/LedgerHQ/app-ethereum/releases and drop it at
# infra/speculos/ethereum.elf instead of building.
#
# Output: infra/speculos/ethereum.elf  (docker-compose loads this).
#
# Requires: Docker. Run once from the repo root:  ./infra/clearsign-app/build.sh
set -euo pipefail

APP_ETHEREUM_REF="${APP_ETHEREUM_REF:-master}"
# Speculos runs --model nanosp, whose BOLOS target is "nanos2".
BOLOS_TARGET="${BOLOS_TARGET:-nanos2}"
# The "-lite" image exposes the per-target SDK env vars in a login shell.
BUILDER_IMAGE="${BUILDER_IMAGE:-ghcr.io/ledgerhq/ledger-app-builder/ledger-app-builder-lite:latest}"

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
WORK="$ROOT/infra/clearsign-app/.app-ethereum"
OUT="$ROOT/infra/speculos/ethereum.elf"

# Reuse an existing clone so re-runs are fast. Set FRESH=1 to re-clone.
if [ -n "${FRESH:-}" ] || [ ! -d "$WORK/.git" ]; then
  echo "==> Cloning app-ethereum@$APP_ETHEREUM_REF (with submodules)"
  rm -rf "$WORK"
  git clone --depth 1 --branch "$APP_ETHEREUM_REF" --recurse-submodules \
    https://github.com/LedgerHQ/app-ethereum "$WORK"
else
  echo "==> Reusing existing clone at $WORK (set FRESH=1 to re-clone)"
fi

echo "==> Building app-ethereum for $BOLOS_TARGET (this takes a few minutes)"
# bash -lc (login shell) so the image's SDK env vars are populated. The nano S+
# target ("nanos2") uses the NANOSP_SDK path (/opt/nanosplus-secure-sdk).
docker run --rm -e BT="$BOLOS_TARGET" -v "$WORK:/app" "$BUILDER_IMAGE" bash -lc '
  set -e
  cd /app
  case "$BT" in
    nanos2|nanosp) SDK="$NANOSP_SDK" ;;
    nanox)         SDK="$NANOX_SDK" ;;
    nanos)         SDK="$NANOS_SDK" ;;
    stax)          SDK="$STAX_SDK" ;;
    flex)          SDK="$FLEX_SDK" ;;
    *) echo "Unknown BOLOS target: $BT" >&2; exit 1 ;;
  esac
  if [ -z "$SDK" ]; then echo "SDK env var empty for $BT" >&2; exit 1; fi
  echo "Using BOLOS_SDK=$SDK"
  make clean
  make -j BOLOS_SDK="$SDK"
'

SRC_ELF="$(find "$WORK/build" -name app.elf 2>/dev/null | head -n1)"
if [ -z "$SRC_ELF" ] || [ ! -f "$SRC_ELF" ]; then
  echo "!! Build did not produce an app.elf under $WORK/build" >&2
  exit 1
fi
cp "$SRC_ELF" "$OUT"
echo "==> Done. Wrote $OUT"
echo ""
echo "Next:  docker compose up"
