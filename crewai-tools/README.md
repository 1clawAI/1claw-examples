# 1claw-crewai-tools Example

> **Reference only** -- not for production use. Review and adapt for your own security requirements.

Two Python scripts showing how to use [`1claw-crewai-tools`](https://pypi.org/project/1claw-crewai-tools/) with CrewAI agents. One script runs a multi-agent crew, the other shows single-tool usage.

## Prerequisites

- Python 3.10+
- A [1Claw](https://1claw.xyz) account with a vault and at least one secret
- An agent registered in your org with an `ocv_` API key and a read policy on the vault
- An LLM API key: `OPENAI_API_KEY` or `GOOGLE_API_KEY` (Gemini)

## Setup

```bash
cd examples/crewai-tools
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
# Edit .env with your credentials
```

## Scripts

### 1. Multi-agent crew

```bash
python crew_demo.py
```

Runs a two-agent CrewAI crew:
- **Secrets Manager** lists vault secrets and checks access
- **Knowledge Manager** stores a note in encrypted memory and recalls it

All 11 tools are loaded with `get_all_tools()` and shared across both agents.

### 2. Single-tool usage

```bash
python single_tool.py
```

Shows how to use individual tools (like `OneclawVaultTool` and `OneclawMemoryPutTool`) without loading the full suite. Good for agents that only need specific capabilities.

## Environment variables

| Variable | Required | Description |
|----------|----------|-------------|
| `ONECLAW_AGENT_API_KEY` | Yes | Agent API key (`ocv_` prefix) |
| `OPENAI_API_KEY` | One LLM required | OpenAI API key |
| `GOOGLE_API_KEY` | One LLM required | Gemini API key (used via `gemini/gemini-2.0-flash`) |

`agent_id` and `vault_id` are auto-resolved from the API key during token exchange.

## How it works

```
CrewAI Crew
    |
    |-- Secrets Manager agent
    |       |-- oneclaw_vault           (read a secret)
    |       |-- oneclaw_list_secrets    (list all secrets)
    |       |-- oneclaw_rotate_secret   (server-side rotation)
    |
    |-- Knowledge Manager agent
    |       |-- oneclaw_memory_put      (store to encrypted memory)
    |       |-- oneclaw_memory_get      (recall from memory)
    |       |-- oneclaw_memory_search   (semantic search)
    |
    |-- (also available: sign_message, submit_transaction,
    |    get_balance, put_secret, trigger_automation)
```

Each tool talks to the 1Claw Vault API over HTTPS with auto-refreshing JWT auth. Secrets are HSM-encrypted. Memory is encrypted at rest. Signing keys never leave the server.

## Next steps

- [LangChain example](../langchain-1claw/) -- same tools using LangChain
- [Python SDK example](../python-sdk/) -- raw SDK without a framework
- [1Claw docs](https://docs.1claw.xyz/docs/integrations/crewai)
