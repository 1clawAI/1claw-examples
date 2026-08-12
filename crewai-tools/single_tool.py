"""1claw-crewai-tools: Single-tool usage without a full crew.

Shows how to wire up individual tools for focused agents. Useful when
you only need specific 1Claw capabilities (e.g. vault reads) without
loading all 11 tools.

Run:
    pip install -r requirements.txt
    cp .env.example .env
    # fill in .env
    python single_tool.py
"""

from __future__ import annotations

import os
import sys

from dotenv import load_dotenv

load_dotenv()

AGENT_KEY = os.getenv("ONECLAW_AGENT_API_KEY", "")

if not AGENT_KEY:
    print("Set ONECLAW_AGENT_API_KEY in .env (ocv_ prefix)")
    sys.exit(1)
if not os.getenv("OPENAI_API_KEY") and not os.getenv("GOOGLE_API_KEY"):
    print("Set OPENAI_API_KEY or GOOGLE_API_KEY for the LLM.")
    sys.exit(1)


def main() -> None:
    from crewai import Agent, Crew, Process, Task
    from oneclaw_crewai import (
        OneclawClient,
        OneclawListSecretsTool,
        OneclawMemoryGetTool,
        OneclawMemoryPutTool,
        OneclawVaultTool,
    )

    client = OneclawClient(api_key=AGENT_KEY)

    # Only load the tools this agent needs
    vault_tool = OneclawVaultTool(client=client)
    list_tool = OneclawListSecretsTool(client=client)
    mem_put = OneclawMemoryPutTool(client=client)
    mem_get = OneclawMemoryGetTool(client=client)

    tools = [vault_tool, list_tool, mem_put, mem_get]
    print(f"Using {len(tools)} tools: {', '.join(t.name for t in tools)}")

    agent = Agent(
        role="Vault Inspector",
        goal="Check vault contents and remember the results.",
        backstory=(
            "You inspect the secure vault and keep notes about what you find. "
            "Never reveal raw secret values."
        ),
        tools=tools,
        verbose=True,
    )

    task = Task(
        description=(
            "1. Use oneclaw_list_secrets to see what secrets exist. "
            "2. Use oneclaw_memory_put to store a note in namespace 'audit' "
            "   with key 'vault-check' and value describing what you found. "
            "3. Use oneclaw_memory_get to recall that note and confirm it. "
            "Report a brief summary."
        ),
        expected_output="Summary of vault contents and stored audit note.",
        agent=agent,
    )

    crew = Crew(
        agents=[agent],
        tasks=[task],
        process=Process.sequential,
        verbose=True,
    )

    print("\n=== Running single-agent crew ===\n")
    result = crew.kickoff()
    print(f"\n=== Result ===\n{result}")

    client.close()


if __name__ == "__main__":
    main()
