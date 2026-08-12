"""langchain-1claw: Interactive chat with persistent memory.

Messages are stored in 1Claw's encrypted agent memory via
OneclawChatMessageHistory. The conversation survives restarts
because all messages are persisted to the vault.

Run:
    pip install -r requirements.txt
    cp .env.example .env
    # fill in .env
    python chat_memory.py
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

from langchain_core.prompts import ChatPromptTemplate, MessagesPlaceholder
from langchain_core.runnables.history import RunnableWithMessageHistory
from langchain_openai import ChatOpenAI

from langchain_1claw import OneclawChatMessageHistory, OneclawClient


def main() -> None:
    client = OneclawClient(api_key=AGENT_KEY)

    llm = ChatOpenAI(model="gpt-4o-mini", temperature=0.7)
    prompt = ChatPromptTemplate.from_messages([
        (
            "system",
            "You are a helpful assistant. You remember everything the user "
            "tells you because your memory is backed by an encrypted vault. "
            "Refer to previous messages when relevant.",
        ),
        MessagesPlaceholder("history"),
        ("human", "{input}"),
    ])
    chain = prompt | llm

    chain_with_history = RunnableWithMessageHistory(
        chain,
        lambda session_id: OneclawChatMessageHistory(
            client=client,
            session_id=session_id,
            max_messages=50,
        ),
        input_messages_key="input",
        history_messages_key="history",
    )

    session_id = "langchain-1claw-demo"
    config = {"configurable": {"session_id": session_id}}

    print("=== 1Claw Chat with Persistent Memory ===")
    print(f"Session: {session_id}")
    print("Type 'quit' to exit, 'clear' to reset history.\n")

    while True:
        try:
            user_input = input("You: ").strip()
        except (EOFError, KeyboardInterrupt):
            break

        if not user_input:
            continue
        if user_input.lower() == "quit":
            break
        if user_input.lower() == "clear":
            history = OneclawChatMessageHistory(
                client=client, session_id=session_id
            )
            history.clear()
            print("History cleared.\n")
            continue

        response = chain_with_history.invoke(
            {"input": user_input}, config=config
        )
        print(f"\nAssistant: {response.content}\n")

    client.close()
    print("Goodbye.")


if __name__ == "__main__":
    main()
