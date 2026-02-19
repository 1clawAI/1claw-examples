"use client";

import { Chat } from "@/components/Chat";

export default function Home() {
  return (
    <main className="max-w-3xl mx-auto px-4 py-8">
      <header className="mb-8 text-center">
        <h1 className="text-2xl font-bold tracking-tight">
          1Claw Agent Secret Demo
        </h1>
        <p className="text-zinc-400 mt-2 text-sm">
          An AI agent (Claude) accesses secrets stored in a 1Claw vault.
          Gated secrets require human approval before the agent can proceed.
        </p>
      </header>
      <Chat />
    </main>
  );
}
