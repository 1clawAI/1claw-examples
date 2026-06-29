"""
1Claw Python SDK — Basic Example

Demonstrates the core SDK flows:
  1. Authenticate with an API key
  2. Create a vault
  3. Store a secret
  4. Retrieve and read the secret
  5. List vault secrets (metadata only)
  6. Check billing usage
  7. Clean up
"""

from __future__ import annotations

import os
import sys

from dotenv import load_dotenv

from oneclaw import OneclawError, create_client

load_dotenv()

BASE_URL = os.getenv("ONECLAW_BASE_URL", "https://api.1claw.xyz")
API_KEY = os.getenv("ONECLAW_API_KEY")
AGENT_ID = os.getenv("ONECLAW_AGENT_ID")
VAULT_ID = os.getenv("ONECLAW_VAULT_ID")

if not API_KEY:
    print("Required: ONECLAW_API_KEY (set in .env or environment)")
    sys.exit(1)


def main() -> None:
    print("Creating client...")
    client = create_client(base_url=BASE_URL, api_key=API_KEY, agent_id=AGENT_ID)

    vault_id: str | None = None
    vault_created = False

    try:
        # ── 1. Create or reuse a vault ──────────────────────────────
        if VAULT_ID:
            print(f"\nUsing existing vault: {VAULT_ID}")
            vault_id = VAULT_ID
        else:
            print("\n--- Creating vault ---")
            res = client.vaults.create(
                name="python-sdk-demo",
                description="Created by the Python SDK example",
            )
            vault_id = res.data["id"]
            vault_created = True
            print(f"  Vault created: {vault_id}")

        # ── 2. Store a secret ───────────────────────────────────────
        print("\n--- Storing secret ---")
        client.secrets.set(
            vault_id,
            "demo/api-key",
            value="sk-demo-python-12345",
            type="api_key",
        )
        print("  Secret stored at path: demo/api-key")

        # ── 3. Retrieve the secret ──────────────────────────────────
        print("\n--- Retrieving secret ---")
        secret = client.secrets.get(vault_id, "demo/api-key")
        sdata = secret.data if secret.data else {}
        val = sdata.get("value", "")
        masked = val[:6] + "..." + val[-4:] if len(val) > 10 else val
        print(f"  Value: {masked}")
        print(f"  Type:  {sdata.get('type', 'N/A')}")

        # ── 4. List secrets ─────────────────────────────────────────
        print("\n--- Listing secrets ---")
        listing = client.secrets.list(vault_id)
        entries = (listing.data or {}).get("secrets", [])
        print(f"  Found {len(entries)} secret(s):")
        for entry in entries:
            print(f"    - {entry.get('path', '?')} (v{entry.get('current_version', '?')})")

        # ── 5. Billing usage ────────────────────────────────────────
        print("\n--- Billing usage ---")
        sub = client.billing.subscription()
        sub_data = sub.data or {}
        usage = sub_data.get("usage", {})
        req = usage.get("requests", {})
        print(f"  Plan:     {sub_data.get('tier', 'unknown')}")
        print(f"  Requests: {req.get('used', '?')} / {req.get('limit', '?')}")
        print(f"  Status:   {sub_data.get('status', '?')}")

        # ── 6. List chains ──────────────────────────────────────────
        print("\n--- Supported chains ---")
        chains_res = client.chains.list()
        chains = (chains_res.data or {}).get("chains", [])
        names = [c.get("name", "?") for c in chains[:6]]
        print(f"  {', '.join(names)}" + (" ..." if len(chains) > 6 else ""))

        print("\n✓ All operations completed successfully.")

    except OneclawError as e:
        print(f"\n✗ 1Claw API error: {e}")
        sys.exit(1)

    finally:
        # ── 7. Clean up ────────────────────────────────────────────
        if vault_created and vault_id:
            print("\n--- Cleaning up ---")
            try:
                client.secrets.delete(vault_id, "demo/api-key")
                client.vaults.delete(vault_id)
                print("  Vault and secret deleted.")
            except OneclawError as e:
                print(f"  Cleanup warning: {e}")

        client.close()


if __name__ == "__main__":
    main()
