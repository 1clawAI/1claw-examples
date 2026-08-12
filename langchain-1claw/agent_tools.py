"""langchain-1claw: Tool-calling agent with all 11 tools.

Creates a LangChain agent with full 1Claw access: vault secrets, encrypted
memory, blockchain signing, and workflow automations. The agent lists vault
secrets, stores a value in memory, and recalls it.

Run:
    pip install -r requirements.txt
    cp .env.example .env
    # fill in .env
    python agent_tools.py
"""

from __future__ import annotations

import os
import sys

from dotenv import load_dotenv

load_dotenv()

AGENT_KEY = os.getenv("ONECLAW_AGENT_API_KEY", "")
OPENAI_KEY = os.getenv("OPENAI_API_KEY", "")

if not AGENT_KEY:
    print("Set ONECLAW_AGENT_API_KEY in .env (ocv_ prefix)")
    sys.exit(1)
if not OPENAI_KEY:
    print("Set OPENAI_API_KEY in .env")
    sys.exit(1)

from langchain.agents import AgentExecutor, create_tool_calling_agent
from langchain_core.prompts import ChatPromptTemplate
from langchain_openai import ChatOpenAI

from langchain_1claw import OneclawClient, get_all_tools


def main() -> None:
    client = OneclawClient(api_key=AGENT_KEY)
    tools = get_all_tools(client)

    print(f"Loaded {len(tools)} 1Claw tools:")
    for t in tools:
        print(f"  - {t.name}")

    llm = ChatOpenAI(model="gpt-4o-mini", temperature=0)

    prompt = ChatPromptTemplate.from_messages([
        (
            "system",
            "You are a helpful assistant with access to a secure 1Claw vault, "
            "blockchain signing keys, encrypted agent memory, and workflow automations. "
            "Use the tools to help the user manage secrets, remember information, "
            "and trigger workflows. Never reveal raw secret values to the user "
            "unless they explicitly ask. Keep responses concise.",
        ),
        ("human", "{input}"),
        ("placeholder", "{agent_scratchpad}"),
    ])

    agent = create_tool_calling_agent(llm, tools, prompt)
    executor = AgentExecutor(agent=agent, tools=tools, verbose=True)

    # --- Step 1: List vault secrets ---
    print("\n=== Step 1: Listing vault secrets ===\n")
    result = executor.invoke({
        "input": "List all secrets in my vault. Tell me how many you found."
    })
    print(f"\nAgent: {result['output']}")

    # --- Step 2: Store something in memory ---
    print("\n=== Step 2: Storing a value in memory ===\n")
    result = executor.invoke({
        "input": (
            "Remember that the deployment was verified today. "
            "Use the memory_put tool with namespace 'notes' and "
            "key 'last-deployment-check'."
        )
    })
    print(f"\nAgent: {result['output']}")

    # --- Step 3: Recall from memory ---
    print("\n=== Step 3: Recalling from memory ===\n")
    result = executor.invoke({
        "input": (
            "What did you store about the deployment check? "
            "Look in the 'notes' namespace under 'last-deployment-check'."
        )
    })
    print(f"\nAgent: {result['output']}")

    client.close()
    print("\nDone.")


if __name__ == "__main__":
    main()
