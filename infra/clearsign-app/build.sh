#!/usr/bin/env bash
# Build a custom Ledger Ethereum app (.elf) that trusts the PUBLIC clear-signing
# TEST key (app-ethereum's keychain/cal.pem) instead of Ledger's production CAL
# key.
#
# Why: the x402 USDC "TransferWithAuthorization" clear-signing descriptor exists
# in Ledger's registry, but the signed filters are only served by Ledger's CAL
# behind a gating token we don't have. With this test-key build we sign the
# filters OURSELVES (with the public cal.pem) and the device shows the curated
# From / To / Amount "0.01 USDC" view -- fully local, no CAL, no token, no blind.
#
# The cal.pem public key matches the app's HAVE_CAL_TEST_KEY constant exactly,
# so a build with CAL_TEST_KEY=1 verifies our self-signed filters.
#
# Output: infra/speculos/ethereum-clearsign.elf  (docker-compose loads this).
#
# Requires: Docker. Run once from the repo root:  ./infra/clearsign-app/build.sh
set -euo pipefail

# Pin the app version to the one the committed prod elf was built from; override
# with APP_ETHEREUM_REF=... if needed. Must support EIP-712 v2 filtering.
APP_ETHEREUM_REF="${APP_ETHEREUM_REF:-master}"
# Speculos runs --model nanosp, whose BOLOS target is "nanos2".
BOLOS_TARGET="${BOLOS_TARGET:-nanos2}"
# The "-lite" image sets the per-target SDK env vars ($NANOS2_SDK, ...) so a
# non-interactive `bash -c` can see them. The full image does not.
BUILDER_IMAGE="${BUILDER_IMAGE:-ghcr.io/ledgerhq/ledger-app-builder/ledger-app-builder-lite:latest}"

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
WORK="$ROOT/infra/clearsign-app/.app-ethereum"
OUT="$ROOT/infra/speculos/ethereum-clearsign.elf"

# Reuse an existing clone so re-runs (e.g. after a build tweak) are fast. Delete
# infra/clearsign-app/.app-ethereum to force a fresh clone, or set FRESH=1.
if [ -n "${FRESH:-}" ] || [ ! -d "$WORK/.git" ]; then
  echo "==> Cloning app-ethereum@$APP_ETHEREUM_REF (with submodules)"
  rm -rf "$WORK"
  git clone --depth 1 --branch "$APP_ETHEREUM_REF" --recurse-submodules \
    https://github.com/LedgerHQ/app-ethereum "$WORK"
else
  echo "==> Reusing existing clone at $WORK (set FRESH=1 to re-clone)"
fi

echo "==> Building with CAL_TEST_KEY=1 for $BOLOS_TARGET (this takes a few minutes)"
# Resolve the SDK path INSIDE the container (single-quoted body), so the env var
# is expanded where it is defined rather than on the host.
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
  make -j CAL_TEST_KEY=1 BOLOS_SDK="$SDK"
'

SRC_ELF="$(find "$WORK/build" -name app.elf 2>/dev/null | head -n1)"
if [ -z "$SRC_ELF" ] || [ ! -f "$SRC_ELF" ]; then
  echo "!! Build did not produce an app.elf under $WORK/build" >&2
  exit 1
fi
cp "$SRC_ELF" "$OUT"
echo "==> Done. Wrote $OUT"
echo "    This is a TEST-KEY app (for Speculos only) -- it trusts cal.pem, not"
echo "    Ledger's production key. Never use it with real funds."
echo ""
echo "Next:  docker compose up   (Speculos now loads the clear-signing app)"
