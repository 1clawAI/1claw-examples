"""
1Claw Python SDK — Agent Workflow Demo

Demonstrates agent-specific SDK flows:
  1. Authenticate as an agent (ocv_ key auto-exchange)
  2. List accessible vaults
  3. Read a secret (policy-gated)
  4. Check agent details via /agents/me
  5. List audit events

Requires an agent with:
  - An ocv_ API key
  - At least one access policy granting read on a vault
"""

from __future__ import annotations

import os
import sys

from dotenv import load_dotenv

from oneclaw import AuthError, NotFoundError, OneclawError, create_client

load_dotenv()

BASE_URL = os.getenv("ONECLAW_BASE_URL", "https://api.1claw.xyz")
API_KEY = os.getenv("ONECLAW_API_KEY")
AGENT_ID = os.getenv("ONECLAW_AGENT_ID")
VAULT_ID = os.getenv("ONECLAW_VAULT_ID")
SECRET_PATH = os.getenv("ONECLAW_SECRET_PATH", "demo/api-key")

if not API_KEY or not API_KEY.startswith("ocv_"):
    print("Required: ONECLAW_API_KEY starting with ocv_ (agent API key)")
    print("  Optional: ONECLAW_AGENT_ID (auto-discovered from key if omitted)")
    sys.exit(1)


def main() -> None:
    print("Creating agent client...")

    with create_client(
        base_url=BASE_URL,
        api_key=API_KEY,
        agent_id=AGENT_ID,
    ) as client:
        agent_id = client.resolved_agent_id or AGENT_ID
        print(f"  Authenticated as agent: {agent_id}")

        # ── 1. List vaults ──────────────────────────────────────────
        print("\n--- Listing vaults ---")
        vaults_res = client.vaults.list()
        vaults = vaults_res.data.get("vaults", [])
        print(f"  Accessible vaults: {len(vaults)}")
        for v in vaults:
            print(f"    - {v.get('name', '?')} ({v['id'][:8]}...)")

        # ── 2. Read a secret (if vault provided) ────────────────────
        if VAULT_ID:
            print(f"\n--- Reading secret: {SECRET_PATH} ---")
            try:
                secret = client.secrets.get(VAULT_ID, SECRET_PATH)
                val = secret.data.get("value", "")
                masked = val[:4] + "****" + val[-4:] if len(val) > 8 else "[short]"
                print(f"  Value: {masked}")
                print(f"  Type:  {secret.data.get('type', 'N/A')}")
            except NotFoundError:
                print(f"  Secret '{SECRET_PATH}' not found in vault")
            except AuthError as e:
                print(f"  Access denied (check agent policies): {e}")
        else:
            print("\n  (Set ONECLAW_VAULT_ID to test secret reads)")

        # ── 3. Agent self-info ──────────────────────────────────────
        if agent_id:
            print("\n--- Agent info (/agents/me) ---")
            try:
                me = client.agents.me()
                print(f"  Name:    {me.data.get('name', '?')}")
                print(f"  Active:  {me.data.get('is_active', '?')}")
                print(f"  Shroud:  {me.data.get('shroud_enabled', False)}")
                print(f"  Intents: {me.data.get('intents_api_enabled', False)}")
            except OneclawError as e:
                print(f"  Could not fetch agent info: {e}")

        # ── 4. Recent audit events ──────────────────────────────────
        print("\n--- Recent audit events ---")
        try:
            audit = client.audit.list(limit=5)
            events = audit.data.get("events", [])
            for ev in events:
                action = ev.get("action", "?")
                resource = ev.get("resource_type", "?")
                ts = ev.get("timestamp", "?")
                if isinstance(ts, str) and len(ts) > 19:
                    ts = ts[:19]
                print(f"  {ts}  {action:30s}  {resource}")
            if not events:
                print("  (no events)")
        except OneclawError:
            print("  (audit not accessible)")

        print("\n✓ Agent workflow completed.")


if __name__ == "__main__":
    main()
