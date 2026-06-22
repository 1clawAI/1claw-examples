# 1Claw Python SDK Example

> Demonstrates the [1Claw Python SDK](https://pypi.org/project/oneclaw/) — vault CRUD, secrets, billing, agent workflows.

| Difficulty | Time  | What you'll build                                                     |
| ---------- | ----- | --------------------------------------------------------------------- |
| Beginner   | 5 min | Python scripts: vault CRUD, secrets, billing, agent auth & audit      |

## Prerequisites

- Python 3.9+
- A 1Claw API key ([1claw.xyz/settings/api-keys](https://1claw.xyz/settings/api-keys))

## Setup

```bash
cd examples/python-sdk
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt

cp .env.example .env
# Edit .env with your API key
```

## Run

### Basic flow (vault + secrets + billing)

```bash
python main.py
```

This will:

1. Authenticate with your API key
2. Create a vault (`python-sdk-demo`)
3. Store and retrieve a secret
4. List secrets
5. Check billing usage and supported chains
6. Clean up (delete vault and secret)

### Agent workflow

```bash
# Set an agent key in .env first:
# ONECLAW_API_KEY=ocv_your_agent_key
python agent_demo.py
```

This will:

1. Authenticate as an agent (auto-discovers agent ID)
2. List accessible vaults
3. Read a secret (policy-gated)
4. Fetch agent self-info (`/agents/me`)
5. List recent audit events

## Environment variables

| Variable              | Required | Description                              |
| --------------------- | -------- | ---------------------------------------- |
| `ONECLAW_API_KEY`     | Yes      | `1ck_` (user) or `ocv_` (agent) API key |
| `ONECLAW_BASE_URL`    | No       | API URL (default: `https://api.1claw.xyz`) |
| `ONECLAW_AGENT_ID`    | No       | Agent UUID (auto-discovered for `ocv_` keys) |
| `ONECLAW_VAULT_ID`    | No       | Skip vault creation, use an existing vault |
| `ONECLAW_SECRET_PATH` | No       | Secret path for agent reads (default: `demo/api-key`) |

## SDK reference

```python
from oneclaw import create_client

# User key (auto-exchanges for JWT)
client = create_client(api_key="1ck_...")

# Agent key (auto-exchanges, auto-refreshes)
client = create_client(api_key="ocv_...")

# Context manager for automatic cleanup
with create_client(api_key="ocv_...") as client:
    vaults = client.vaults.list()
```

Install from PyPI:

```bash
pip install oneclaw
```

Full docs: [docs.1claw.xyz](https://docs.1claw.xyz) | SDK source: [github.com/1clawAI/1claw-python-sdk](https://github.com/1clawAI/1claw-python-sdk)
