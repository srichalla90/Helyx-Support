#!/usr/bin/env bash
# run-e2e.sh — Build-validate then E2E test Helyx Support
# Usage: bash run-e2e.sh
#
# Sequence:
#   1. React build check  (catches JSX/import errors — no server needed)
#   2. Start API server   (background)
#   3. API E2E tests      (SKIP_BUILD_CHECK=1 so step 1 isn't repeated)
#   4. Stop server

set -euo pipefail
ROOT="$(cd "$(dirname "$0")" && pwd)"
CLIENT="$ROOT/client"
SERVER="$ROOT/server"
LOG=/tmp/helyx-server-$$.log
TMPBUILD=/tmp/vite-e2e-$$

cleanup() {
  if [[ -n "${SERVER_PID:-}" ]]; then
    kill "$SERVER_PID" 2>/dev/null || true
  fi
  rm -rf "$TMPBUILD"
}
trap cleanup EXIT

# ── Step 1: Frontend build ────────────────────────────────────────────────────
echo ""
echo "▶ Frontend Build"
BUILD_OUT=$(cd "$CLIENT" && npx vite build --outDir "$TMPBUILD" --emptyOutDir 2>&1)
BUILD_EXIT=$?
if [[ $BUILD_EXIT -eq 0 ]]; then
  echo "  ✓ React client built successfully"
else
  echo "  ✗ Build failed:"
  echo "$BUILD_OUT" | grep -i "error:" | head -10 || echo "$BUILD_OUT" | tail -20
  exit 1
fi

# ── Step 2: Start server ──────────────────────────────────────────────────────
echo ""
echo "▶ Starting API server..."
node "$SERVER/index.js" > "$LOG" 2>&1 &
SERVER_PID=$!

# Wait up to 15s for server to be ready
READY=0
for i in $(seq 1 15); do
  sleep 1
  if curl -sf http://localhost:3001/api/health > /dev/null 2>&1; then
    echo "  ✓ Server ready (${i}s, PID $SERVER_PID)"
    READY=1
    break
  fi
done
if [[ $READY -eq 0 ]]; then
  echo "  ✗ Server failed to start within 15s"
  cat "$LOG"
  exit 1
fi

# ── Step 3: E2E tests (build already validated, skip re-check) ────────────────
echo ""
SKIP_BUILD_CHECK=1 node "$ROOT/e2e_test_comprehensive.js"
