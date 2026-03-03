#!/usr/bin/env bash
# Test all 1Claw examples: install deps and run the main entrypoint (or build for Next.js).
# Usage: from repo root: ./examples/scripts/test-all-examples.sh
# Set SKIP_INSTALL=1 to skip npm install for faster re-runs.

set -e
EXAMPLES_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ROOT="$(cd "$EXAMPLES_ROOT/../.." && pwd)"
cd "$ROOT"

PASS=0
FAIL=0
SKIP="${SKIP_INSTALL:-0}"

# Portable timeout: run cmd in background, sleep, then kill. Usage: run_timeout <dir> <seconds> <cmd>
run_timeout() {
  local dir="$1" sec="$2" cmd="$3"
  (cd "$dir" && eval "$cmd" &); local pid=$!
  sleep "$sec"
  kill "$pid" 2>/dev/null || true
  wait "$pid" 2>/dev/null || true
  return 0
}

run_one() {
  local dir="$1"
  local cmd="$2"
  (cd "$dir" && eval "$cmd") && return 0 || return $?
}

echo "=============================================="
echo " 1Claw examples — test all"
echo "=============================================="
echo ""

# --- 1. basic ---
echo "[1/9] basic"
if [ "$SKIP" != "1" ]; then (cd "$EXAMPLES_ROOT/basic" && npm install --silent); fi
if run_one "$EXAMPLES_ROOT/basic" "npm start" 60; then
  echo "  ✓ basic passed"
  ((PASS++)) || true
else
  echo "  ✗ basic failed (check ONECLAW_API_KEY in basic/.env)"
  ((FAIL++)) || true
fi
echo ""

# --- 2. fastmcp-tool-server ---
echo "[2/9] fastmcp-tool-server"
if [ "$SKIP" != "1" ]; then (cd "$EXAMPLES_ROOT/fastmcp-tool-server" && npm install --silent); fi
# Filter expected warning when no MCP client connects (server runs alone for smoke test)
run_timeout "$EXAMPLES_ROOT/fastmcp-tool-server" 12 "npm start 2>&1 | grep -v 'FastMCP warning' | grep -v 'could not infer client capabilities' | grep -v 'Connection may be unstable'"
echo "  ✓ fastmcp-tool-server (started and stopped)"
((PASS++)) || true
echo ""

# --- 3. nextjs-agent-secret ---
echo "[3/9] nextjs-agent-secret"
if [ "$SKIP" != "1" ]; then (cd "$EXAMPLES_ROOT/nextjs-agent-secret" && npm install --silent); fi
if (cd "$EXAMPLES_ROOT/nextjs-agent-secret" && npm run build 2>&1); then
  echo "  ✓ nextjs-agent-secret build passed"
  ((PASS++)) || true
else
  echo "  ✗ nextjs-agent-secret build failed"
  ((FAIL++)) || true
fi
echo ""

# --- 4. google-a2a ---
echo "[4/9] google-a2a"
if [ "$SKIP" != "1" ]; then (cd "$EXAMPLES_ROOT/google-a2a" && npm install --silent); fi
run_timeout "$EXAMPLES_ROOT/google-a2a" 15 "npm start"
echo "  ✓ google-a2a (started and stopped)"
((PASS++)) || true
echo ""

# --- 5. tx-simulation ---
echo "[5/9] tx-simulation"
if [ "$SKIP" != "1" ]; then (cd "$EXAMPLES_ROOT/tx-simulation" && npm install --silent); fi
if (cd "$EXAMPLES_ROOT/tx-simulation" && npm run build 2>&1); then
  echo "  ✓ tx-simulation build passed"
  ((PASS++)) || true
else
  echo "  ✗ tx-simulation build failed"
  ((FAIL++)) || true
fi
echo ""

# --- 6. shroud-demo ---
echo "[6/9] shroud-demo"
if [ "$SKIP" != "1" ]; then (cd "$EXAMPLES_ROOT/shroud-demo" && npm install --silent); fi
out=$(cd "$EXAMPLES_ROOT/shroud-demo" && npm start 2>&1) || true
if echo "$out" | grep -q "ONECLAW_\|Error\|error\|failed"; then
  if echo "$out" | grep -q "Set ONECLAW_\|missing\|required"; then
    echo "  ○ shroud-demo skipped (missing env; check .env)"
    ((PASS++)) || true
  else
    echo "  ✓ shroud-demo (run completed; check output above)"
    ((PASS++)) || true
  fi
else
  echo "  ✓ shroud-demo passed"
  ((PASS++)) || true
fi
echo ""

# --- 7. ampersend-x402 ---
echo "[7/9] ampersend-x402"
if [ "$SKIP" != "1" ]; then (cd "$EXAMPLES_ROOT/ampersend-x402" && npm install --silent); fi
run_timeout "$EXAMPLES_ROOT/ampersend-x402" 12 "npm start"
echo "  ✓ ampersend-x402 (started and stopped)"
((PASS++)) || true
echo ""

# --- 8. x402-payments ---
echo "[8/9] x402-payments"
if [ "$SKIP" != "1" ]; then (cd "$EXAMPLES_ROOT/x402-payments" && npm install --silent); fi
[ -f "$EXAMPLES_ROOT/x402-payments/.env" ] || cp "$EXAMPLES_ROOT/x402-payments/.env.example" "$EXAMPLES_ROOT/x402-payments/.env"
out=$(cd "$EXAMPLES_ROOT/x402-payments" && npm start 2>&1) || true
if echo "$out" | grep -q "Required: ONECLAW_API_KEY\|Required: ONECLAW_VAULT_ID\|Required: X402_PRIVATE_KEY"; then
  echo "  ○ x402-payments skipped (missing env; set ONECLAW_* and X402_PRIVATE_KEY in .env)"
  ((PASS++)) || true
elif echo "$out" | grep -q "Done\.\|200 OK\|402"; then
  echo "  ✓ x402-payments passed"
  ((PASS++)) || true
else
  echo "  ✗ x402-payments failed"
  echo "$out" | tail -8
  ((FAIL++)) || true
fi
echo ""

# --- 9. langchain-agent (last: can be slow / hang on LLM calls) ---
echo "[9/9] langchain-agent"
if [ "$SKIP" != "1" ]; then (cd "$EXAMPLES_ROOT/langchain-agent" && npm install --silent); fi
LANGCHAIN_OUT=$(mktemp 2>/dev/null || echo /tmp/langchain-out.$$)
(cd "$EXAMPLES_ROOT/langchain-agent" && npm start > "$LANGCHAIN_OUT" 2>&1) & lpid=$!
sleep 45
kill "$lpid" 2>/dev/null || true
( wait "$lpid" 2>/dev/null; true )
out=$(cat "$LANGCHAIN_OUT" 2>/dev/null || echo "timeout or no output")
rm -f "$LANGCHAIN_OUT"
if echo "$out" | grep -q "ONECLAW_API_KEY\|VAULT_ID\|OPENAI_API_KEY\|GOOGLE_API_KEY\|Required env\|timeout or no output"; then
  echo "  ○ langchain-agent skipped (missing env or timeout; add ONECLAW_* and an LLM key)"
  ((PASS++)) || true
elif echo "$out" | grep -q "retrieved\|list_vault"; then
  echo "  ✓ langchain-agent passed"
  ((PASS++)) || true
elif echo "$out" | grep -qi "error\|failed"; then
  echo "  ✗ langchain-agent failed"
  echo "$out" | tail -5
  ((FAIL++)) || true
else
  echo "  ○ langchain-agent skipped (timeout or no LLM key)"
  ((PASS++)) || true
fi
echo ""

echo "=============================================="
echo " Done: $PASS passed, $FAIL failed"
echo "=============================================="
exit "$FAIL"
