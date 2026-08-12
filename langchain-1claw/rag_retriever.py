"""langchain-1claw: RAG chain with semantic memory retriever.

Seeds agent memory with knowledge entries, then uses OneclawMemoryRetriever
to fetch relevant context and feed it to the LLM. The retriever runs
semantic search over 1Claw's vector-indexed memory.

Run:
    pip install -r requirements.txt
    cp .env.example .env
    # fill in .env
    python rag_retriever.py
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

from langchain_core.output_parsers import StrOutputParser
from langchain_core.prompts import ChatPromptTemplate
from langchain_core.runnables import RunnablePassthrough
from langchain_openai import ChatOpenAI

from langchain_1claw import OneclawClient, OneclawMemoryRetriever


KNOWLEDGE_ENTRIES = {
    "deploy-staging": (
        "To deploy to staging, run 'git push origin staging'. "
        "The CI pipeline builds a Docker image and deploys to Cloud Run. "
        "Health check endpoint: /v1/health. Allow 3 minutes for rollout."
    ),
    "deploy-production": (
        "Production deploys require a passing CI build on main. "
        "Tag the release with 'v' prefix (e.g. v0.42.0). "
        "The deploy workflow pushes to Artifact Registry and updates Cloud Run. "
        "Verify with the /status page after deploy."
    ),
    "incident-response": (
        "For P1 incidents: check the #incidents Slack channel. "
        "Rotate any compromised API keys immediately via the 1Claw dashboard. "
        "Use the audit log to determine scope. Notify affected users within 1 hour."
    ),
    "onboarding": (
        "New team members: 1) Create a 1Claw account at 1claw.xyz. "
        "2) Ask a team admin to add you to the org. "
        "3) Set up 2FA under Settings > Security. "
        "4) Install the CLI: brew install 1clawAI/tap/1claw."
    ),
    "database-backups": (
        "Postgres backups run nightly at 02:00 UTC via Supabase. "
        "Point-in-time recovery is available for the last 7 days (Pro plan). "
        "To restore, use the Supabase dashboard under Database > Backups."
    ),
}


def format_docs(docs: list) -> str:
    if not docs:
        return "(No relevant context found in memory.)"
    return "\n\n".join(
        f"[{doc.metadata.get('key', '?')}] {doc.page_content}"
        for doc in docs
    )


def main() -> None:
    client = OneclawClient(api_key=AGENT_KEY)

    # --- Seed knowledge into memory ---
    print("=== Seeding knowledge entries ===\n")
    for key, value in KNOWLEDGE_ENTRIES.items():
        print(f"  Storing: {key}")
        try:
            client.memory_put("knowledge", key, value, tier="durable")
        except Exception as e:
            print(f"  Warning: could not store '{key}': {e}")
    print()

    # --- Build the RAG chain ---
    retriever = OneclawMemoryRetriever(
        client=client,
        namespace="knowledge",
        top_k=3,
    )

    llm = ChatOpenAI(model="gpt-4o-mini", temperature=0)
    prompt = ChatPromptTemplate.from_messages([
        (
            "system",
            "Answer the question using the context below. The context comes "
            "from our internal knowledge base stored in encrypted agent memory. "
            "If the context does not contain a clear answer, say so.\n\n"
            "Context:\n{context}",
        ),
        ("human", "{question}"),
    ])

    chain = (
        {"context": retriever | format_docs, "question": RunnablePassthrough()}
        | prompt
        | llm
        | StrOutputParser()
    )

    # --- Run queries ---
    questions = [
        "How do I deploy to production?",
        "What should I do during a P1 incident?",
        "How does a new team member get started?",
    ]

    for q in questions:
        print(f"Q: {q}")
        answer = chain.invoke(q)
        print(f"A: {answer}\n")

    client.close()
    print("Done.")


if __name__ == "__main__":
    main()
