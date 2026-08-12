"""1claw-crewai-tools: Multi-agent crew with all 11 tools.

Runs a two-agent crew:
  - Secrets Manager: lists vault secrets and reports what it finds
  - Knowledge Manager: stores a note in encrypted memory and recalls it

All 11 tools are loaded via get_all_tools() and shared across agents.

Run:
    pip install -r requirements.txt
    cp .env.example .env
    # fill in .env
    python crew_demo.py
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


def _get_llm():
    """Pick an LLM: Gemini if GOOGLE_API_KEY is set, otherwise OpenAI."""
    google_key = os.getenv("GOOGLE_API_KEY", "").strip()
    if google_key:
        from crewai import LLM
        return LLM(model="gemini/gemini-2.0-flash", api_key=google_key)

    if not os.getenv("OPENAI_API_KEY"):
        print("Set OPENAI_API_KEY or GOOGLE_API_KEY for the LLM.")
        sys.exit(1)
    return None


def main() -> None:
    from crewai import Agent, Crew, Process, Task
    from oneclaw_crewai import OneclawClient, get_all_tools

    llm = _get_llm()
    client = OneclawClient(api_key=AGENT_KEY)
    tools = get_all_tools(client)

    print(f"Loaded {len(tools)} 1Claw tools:")
    for t in tools:
        print(f"  - {t.name}")

    llm_kwargs = {"llm": llm} if llm else {}

    secrets_agent = Agent(
        role="Secrets Manager",
        goal="List and inspect vault secrets securely.",
        backstory=(
            "You manage credentials stored in an HSM-backed vault. "
            "You never reveal raw secret values. Report metadata only."
        ),
        tools=tools,
        verbose=True,
        **llm_kwargs,
    )

    memory_agent = Agent(
        role="Knowledge Manager",
        goal="Store and recall important information across sessions.",
        backstory=(
            "You use 1Claw's encrypted agent memory to persist notes "
            "and knowledge. Everything you store is encrypted at rest."
        ),
        tools=tools,
        verbose=True,
        **llm_kwargs,
    )

    # Task 1: list vault secrets
    task_list = Task(
        description=(
            "Use oneclaw_list_secrets to list all secrets in the vault. "
            "Report how many secrets you found and their paths. "
            "Do not reveal any secret values."
        ),
        expected_output=(
            "A summary like: 'Found N secrets: path/a, path/b, ...'"
        ),
        agent=secrets_agent,
    )

    # Task 2: store a note in memory
    task_store = Task(
        description=(
            "Use oneclaw_memory_put to store the key 'crew-check' with "
            "value 'secrets verified by CrewAI crew' in namespace 'notes'."
        ),
        expected_output="Confirmation that the value was stored.",
        agent=memory_agent,
    )

    # Task 3: recall the note
    task_recall = Task(
        description=(
            "Use oneclaw_memory_get to retrieve the key 'crew-check' "
            "from namespace 'notes'. Report the value you found."
        ),
        expected_output="The recalled value from memory.",
        agent=memory_agent,
    )

    crew = Crew(
        agents=[secrets_agent, memory_agent],
        tasks=[task_list, task_store, task_recall],
        process=Process.sequential,
        verbose=True,
    )

    print("\n=== Starting CrewAI crew ===\n")
    result = crew.kickoff()
    print(f"\n=== Crew result ===\n{result}")

    client.close()


if __name__ == "__main__":
    main()
