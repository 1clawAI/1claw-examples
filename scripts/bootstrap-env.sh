#!/usr/bin/env bash
# Copy each example's .env.example (or .env.local.example) to .env (.env.local) if missing.
# Usage (from repo root or examples/):
#   ./examples/scripts/bootstrap-env.sh
#   cd examples && npm run bootstrap
# Options:
#   --force     Overwrite existing .env / .env.local
#   --dry-run   Print actions only
#   <name>      Only bootstrap one folder (e.g. basic, nextjs-agent-secret)

set -euo pipefail

EXAMPLES_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
FORCE=0
DRY=0
FILTER=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --force) FORCE=1; shift ;;
    --dry-run) DRY=1; shift ;;
    -h|--help)
      sed -n '1,25p' "$0" | tail -n +2
      exit 0
      ;;
    -*)
      echo "Unknown option: $1" >&2
      exit 1
      ;;
    *)
      if [[ -n "$FILTER" ]]; then
        echo "Only one example name allowed, got: $1" >&2
        exit 1
      fi
      FILTER="$1"
      shift
      ;;
  esac
done

# dir|source|dest — source is relative to dir
MANIFEST=(
  "ampersend-x402|.env.example|.env"
  "anthropic-wif|.env.example|.env"
  "basic|.env.example|.env"
  "fastmcp-tool-server|.env.example|.env"
  "google-a2a|.env.example|.env"
  "intents-layers|.env.example|.env"
  "jwt-ttl-defense|.env.example|.env"
  "langchain-agent|.env.example|.env"
  "local-inspect|.env.example|.env"
  "logos-chat|.env.example|.env"
  "mpc-vault|.env.example|.env"
  "nextjs-agent-secret|.env.local.example|.env.local"
  "shroud-demo|.env.example|.env"
  "shroud-llm|.env.example|.env"
  "shroud-security|.env.example|.env"
  "tx-simulation|.env.example|.env"
  "x402-payments|.env.example|.env"
)

copied=0
skipped=0
missing_tpl=0

bootstrap_one() {
  local dir="$1" src="$2" dest="$3"
  local base="$EXAMPLES_ROOT/$dir"
  local from="$base/$src"
  local to="$base/$dest"

  if [[ ! -f "$from" ]]; then
    echo "  [warn] missing template: $dir/$src"
    missing_tpl=$((missing_tpl + 1))
    return
  fi

  if [[ -n "$FILTER" && "$dir" != "$FILTER" ]]; then
    return
  fi

  if [[ -f "$to" && "$FORCE" -eq 0 ]]; then
    echo "  skip  $dir/$dest (exists; use --force to overwrite)"
    skipped=$((skipped + 1))
    return
  fi

  if [[ "$DRY" -eq 1 ]]; then
    echo "  would copy $dir/$src → $dir/$dest"
    copied=$((copied + 1))
    return
  fi

  cp "$from" "$to"
  echo "  ok    $dir/$dest"
  copied=$((copied + 1))
}

echo "1Claw examples — bootstrap env files"
echo "  root: $EXAMPLES_ROOT"
[[ -n "$FILTER" ]] && echo "  only: $FILTER"
echo ""

for entry in "${MANIFEST[@]}"; do
  IFS='|' read -r dir src dest <<<"$entry"
  bootstrap_one "$dir" "$src" "$dest"
done

echo ""
if [[ "$DRY" -eq 1 ]]; then
  echo "Done (dry-run): $copied would copy, $skipped already present, $missing_tpl missing templates."
else
  echo "Done: $copied created/updated, $skipped skipped (already present), $missing_tpl missing templates."
fi
if [[ -n "$FILTER" && "$copied" -eq 0 && "$skipped" -eq 0 && "$missing_tpl" -eq 0 ]]; then
  echo "No matching example: $FILTER" >&2
  echo "Try one of: ampersend-x402 anthropic-wif basic fastmcp-tool-server google-a2a intents-layers jwt-ttl-defense langchain-agent local-inspect logos-chat mpc-vault nextjs-agent-secret shroud-demo shroud-llm shroud-security tx-simulation x402-payments" >&2
  exit 1
fi
