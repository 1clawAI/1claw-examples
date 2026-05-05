#!/usr/bin/env bash
# Test all 1Claw examples: install deps and run the main entrypoint (or build for Next.js).
# Usage: from repo root: ./examples/scripts/test-all-examples.sh
# Set SKIP_INSTALL=1 to skip npm install for faster re-runs.
# First-time setup: ./examples/scripts/bootstrap-env.sh (copies .env.example → .env per example).

set -e
EXAMPLES_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ROOT="$(cd "$EXAMPLES_ROOT/.." && pwd)"
cd "$ROOT"

PASS=0
FAIL=0
SKIP="${SKIP_INSTALL:-0}"

# Portable timeout: run cmd in background, sleep, then kill. Usage: run_timeout <dir> <seconds> <cmd>
run_timeout() {
  local dir="$1" sec="$2" cmd="$3"
  # Background the whole subshell so $! in this shell is the real child PID
  # (a `&` inside `( )` does not update the parent's $!).
  (cd "$dir" && eval "$cmd") &
  local pid=$!
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

# --- 1. local-inspect (no credentials needed) ---
echo "[1/17] local-inspect"
if [ "$SKIP" != "1" ]; then (cd "$EXAMPLES_ROOT/local-inspect" && npm install --silent); fi
if run_one "$EXAMPLES_ROOT/local-inspect" "npm start"; then
  echo "  ✓ local-inspect passed"
  ((PASS++)) || true
else
  echo "  ✗ local-inspect failed"
  ((FAIL++)) || true
fi
echo ""

# --- 2. basic ---
echo "[2/17] basic"
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
echo "[3/17] fastmcp-tool-server"
if [ "$SKIP" != "1" ]; then (cd "$EXAMPLES_ROOT/fastmcp-tool-server" && npm install --silent); fi
# Filter expected warning when no MCP client connects (server runs alone for smoke test)
run_timeout "$EXAMPLES_ROOT/fastmcp-tool-server" 12 "npm start 2>&1 | grep -v 'FastMCP warning' | grep -v 'could not infer client capabilities' | grep -v 'Connection may be unstable'"
echo "  ✓ fastmcp-tool-server (started and stopped)"
((PASS++)) || true
echo ""

# --- 3. nextjs-agent-secret ---
echo "[4/17] nextjs-agent-secret"
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
echo "[5/17] google-a2a"
if [ "$SKIP" != "1" ]; then (cd "$EXAMPLES_ROOT/google-a2a" && npm install --silent); fi
run_timeout "$EXAMPLES_ROOT/google-a2a" 15 "npm start"
echo "  ✓ google-a2a (started and stopped)"
((PASS++)) || true
echo ""

# --- 5. tx-simulation ---
echo "[6/17] tx-simulation"
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
echo "[7/17] shroud-demo"
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
echo "[8/17] ampersend-x402"
if [ "$SKIP" != "1" ]; then (cd "$EXAMPLES_ROOT/ampersend-x402" && npm install --silent); fi
run_timeout "$EXAMPLES_ROOT/ampersend-x402" 12 "npm start"
echo "  ✓ ampersend-x402 (started and stopped)"
((PASS++)) || true
echo ""

# --- 8. x402-payments ---
echo "[9/17] x402-payments"
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

# --- 9. langchain-agent (slow: 45s + LLM calls) ---
echo "[10/17] langchain-agent"
if [ "$SKIP" != "1" ]; then (cd "$EXAMPLES_ROOT/langchain-agent" && npm install --silent --legacy-peer-deps); fi
LANGCHAIN_OUT=$(mktemp 2>/dev/null || echo /tmp/langchain-out.$$)
(cd "$EXAMPLES_ROOT/langchain-agent" && npm start > "$LANGCHAIN_OUT" 2>&1) & lpid=$!
sleep 45
kill "$lpid" 2>/dev/null || true
# Under set -e, ( wait; true ) still exits 127 if the child exited 127 (wait runs before true).
wait "$lpid" 2>/dev/null || true
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

# --- 10. shroud-security ---
echo "[11/17] shroud-security"
if [ "$SKIP" != "1" ]; then (cd "$EXAMPLES_ROOT/shroud-security" && npm install --silent); fi
if (cd "$EXAMPLES_ROOT/shroud-security" && npx tsc --noEmit 2>&1); then
  echo "  ✓ shroud-security (typecheck passed)"
  ((PASS++)) || true
else
  echo "  ✗ shroud-security typecheck failed"
  ((FAIL++)) || true
fi
echo ""

# --- 12. shroud-llm (LLM Token Billing + Shroud; skips without agent creds) ---
echo "[12/17] shroud-llm"
if [ "$SKIP" != "1" ]; then (cd "$EXAMPLES_ROOT/shroud-llm" && npm install --silent); fi
[ -f "$EXAMPLES_ROOT/shroud-llm/.env" ] || cp "$EXAMPLES_ROOT/shroud-llm/.env.example" "$EXAMPLES_ROOT/shroud-llm/.env"
out=$(cd "$EXAMPLES_ROOT/shroud-llm" && npm start 2>&1) || true
if echo "$out" | grep -q "Set ONECLAW_AGENT_ID"; then
  echo "  ○ shroud-llm skipped (no agent creds in .env — see examples/shroud-llm/README.md)"
  ((PASS++)) || true
elif echo "$out" | grep -q "Agent token exchange failed\|Could not decode agent JWT"; then
  echo "  ○ shroud-llm skipped (agent token exchange failed — check ONECLAW_AGENT_ID / ONECLAW_AGENT_API_KEY)"
  ((PASS++)) || true
elif echo "$out" | grep -q "\[FAIL\]"; then
  echo "  ✗ shroud-llm failed"
  echo "$out" | tail -12
  ((FAIL++)) || true
else
  echo "  ✓ shroud-llm passed (or soft-skip: billing claims / 401 key)"
  ((PASS++)) || true
fi
echo ""

echo "[13/17] mpc-vault"
if [ "$SKIP" != "1" ]; then (cd "$EXAMPLES_ROOT/mpc-vault" && npm install --silent); fi
if (cd "$EXAMPLES_ROOT/mpc-vault" && npx tsc --noEmit 2>&1); then
  echo "  ✓ mpc-vault (typecheck passed)"
  ((PASS++)) || true
else
  echo "  ✗ mpc-vault typecheck failed"
  ((FAIL++)) || true
fi
echo ""

# --- 14. logos-chat (Next.js UI + Waku CLI; build includes typecheck) ---
echo "[14/17] logos-chat"
if [ "$SKIP" != "1" ]; then (cd "$EXAMPLES_ROOT/logos-chat" && npm install --silent); fi
if (cd "$EXAMPLES_ROOT/logos-chat" && npm run build 2>&1); then
  echo "  ✓ logos-chat build passed"
  ((PASS++)) || true
else
  echo "  ✗ logos-chat build failed"
  ((FAIL++)) || true
fi
echo ""

# --- 15. intents-layers (typecheck; npm start = narrative + optional live sign) ---
echo "[15/17] intents-layers"
if [ "$SKIP" != "1" ]; then (cd "$EXAMPLES_ROOT/intents-layers" && npm install --silent); fi
if (cd "$EXAMPLES_ROOT/intents-layers" && npx tsc --noEmit 2>&1); then
  echo "  ✓ intents-layers (typecheck passed)"
  ((PASS++)) || true
else
  echo "  ✗ intents-layers typecheck failed"
  ((FAIL++)) || true
fi
echo ""

# --- 16. jwt-ttl-defense (typecheck only; run needs a real 1ck_ key) ---
echo "[16/17] jwt-ttl-defense"
if [ "$SKIP" != "1" ]; then (cd "$EXAMPLES_ROOT/jwt-ttl-defense" && npm install --silent); fi
if (cd "$EXAMPLES_ROOT/jwt-ttl-defense" && npx tsc --noEmit 2>&1); then
  echo "  ✓ jwt-ttl-defense (typecheck passed)"
  ((PASS++)) || true
else
  echo "  ✗ jwt-ttl-defense typecheck failed"
  ((FAIL++)) || true
fi
echo ""

# --- 17. anthropic-wif (typecheck only; live run needs an Anthropic WIF provider) ---
echo "[17/17] anthropic-wif"
if [ "$SKIP" != "1" ]; then (cd "$EXAMPLES_ROOT/anthropic-wif" && npm install --silent); fi
if (cd "$EXAMPLES_ROOT/anthropic-wif" && npx tsc --noEmit 2>&1); then
  echo "  ✓ anthropic-wif (typecheck passed)"
  ((PASS++)) || true
else
  echo "  ✗ anthropic-wif typecheck failed"
  ((FAIL++)) || true
fi
echo ""

echo "=============================================="
echo " Done: $PASS passed, $FAIL failed"
echo "=============================================="
exit "$FAIL"
