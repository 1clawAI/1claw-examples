# langchain-1claw Example

> **Reference only** -- not for production use. Review and adapt for your own security requirements.

Three Python scripts showing how to use [`langchain-1claw`](https://pypi.org/project/langchain-1claw/) with LangChain agents. Each one covers a different part of the package.

## Prerequisites

- Python 3.10+
- A [1Claw](https://1claw.xyz) account with a vault and at least one secret
- An agent registered in your org with an `ocv_` API key and a read policy on the vault
- An LLM API key: `OPENAI_API_KEY` (or swap in any LangChain-supported model)

## Setup

```bash
cd examples/langchain-1claw
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
# Edit .env with your credentials
```

## Scripts

### 1. Tool-calling agent

```bash
python agent_tools.py
```

Creates a LangChain agent with all 11 1Claw tools: vault CRUD, encrypted memory, blockchain signing, and automations. The agent lists vault secrets, stores a value in memory, and recalls it.

### 2. Persistent chat with memory

```bash
python chat_memory.py
```

Interactive chat session backed by `OneclawChatMessageHistory`. Conversations persist across restarts because messages are stored in 1Claw's encrypted memory API.

### 3. RAG over agent memory

```bash
python rag_retriever.py
```

Seeds the agent's memory with a few knowledge entries, then runs a retrieval-augmented generation chain using `OneclawMemoryRetriever`. The retriever does semantic search over stored entries and feeds matching context to the LLM.

## Environment variables

| Variable | Required | Description |
|----------|----------|-------------|
| `ONECLAW_AGENT_API_KEY` | Yes | Agent API key (`ocv_` prefix) |
| `OPENAI_API_KEY` | Yes | OpenAI API key for the LLM |

`agent_id` and `vault_id` are auto-resolved from the API key during token exchange.

## How it works

```
User prompt
    |
    v
LangChain Agent (GPT-4o)
    |
    |-- oneclaw_list_secrets    --> 1Claw Vault API
    |-- oneclaw_vault           --> 1Claw Vault API (fetch secret)
    |-- oneclaw_memory_put      --> 1Claw Memory API (write)
    |-- oneclaw_memory_search   --> 1Claw Memory API (semantic search)
    |-- oneclaw_sign_message    --> 1Claw Sign API (EIP-191)
    |-- oneclaw_get_balance     --> 1Claw Signing Keys API
    |-- (8 more tools)
```

Secrets stay in the vault. Signing happens server-side. Memory is encrypted at rest. The LLM never sees raw private keys.

## Next steps

- [CrewAI tools example](../crewai-tools/) -- same tools in a CrewAI crew
- [LangChain TypeScript example](../langchain-agent/) -- TypeScript + `@1claw/sdk` approach
- [Python SDK example](../python-sdk/) -- raw SDK without LangChain
- [1Claw docs](https://docs.1claw.xyz/docs/integrations/langchain)
