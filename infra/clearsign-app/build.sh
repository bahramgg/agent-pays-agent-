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
BUILDER_IMAGE="${BUILDER_IMAGE:-ghcr.io/ledgerhq/ledger-app-builder/ledger-app-builder:latest}"

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
WORK="$ROOT/infra/clearsign-app/.app-ethereum"
OUT="$ROOT/infra/speculos/ethereum-clearsign.elf"

echo "==> Cloning app-ethereum@$APP_ETHEREUM_REF (with submodules)"
rm -rf "$WORK"
git clone --depth 1 --branch "$APP_ETHEREUM_REF" --recurse-submodules \
  https://github.com/LedgerHQ/app-ethereum "$WORK"

echo "==> Building with CAL_TEST_KEY=1 for $BOLOS_TARGET (this takes a few minutes)"
docker run --rm -v "$WORK:/app" "$BUILDER_IMAGE" bash -c "
  set -e
  cd /app
  make clean
  make -j CAL_TEST_KEY=1 BOLOS_SDK=\$${BOLOS_TARGET^^}_SDK
"

SRC_ELF="$WORK/build/$BOLOS_TARGET/bin/app.elf"
if [ ! -f "$SRC_ELF" ]; then
  echo "!! Build did not produce $SRC_ELF" >&2
  exit 1
fi
cp "$SRC_ELF" "$OUT"
echo "==> Done. Wrote $OUT"
echo "    This is a TEST-KEY app (for Speculos only) -- it trusts cal.pem, not"
echo "    Ledger's production key. Never use it with real funds."
echo ""
echo "Next:  docker compose up   (Speculos now loads the clear-signing app)"
