"use client";

import { useChat } from "ai/react";
import { useEffect, useRef, useState } from "react";
import { ApprovalBanner } from "./ApprovalBanner";
import { SecretUsageCard } from "./SecretUsageCard";

export function Chat() {
  const { messages, input, handleInputChange, handleSubmit, isLoading } =
    useChat({ api: "/api/chat" });

  const scrollRef = useRef<HTMLDivElement>(null);
  const [pendingApproval, setPendingApproval] = useState(false);

  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    const hasPending = messages.some(
      (m) =>
        m.role === "assistant" &&
        m.toolInvocations?.some(
          (t) =>
            t.state === "result" &&
            (t.result as Record<string, unknown>)?.status === "pending_approval",
        ),
    );
    setPendingApproval(hasPending);
  }, [messages]);

  return (
    <div className="flex flex-col gap-4">
      {pendingApproval && <ApprovalBanner />}

      <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4 min-h-[400px] max-h-[600px] overflow-y-auto">
        {messages.length === 0 && (
          <div className="text-zinc-500 text-sm text-center py-16">
            Ask the agent to access a secret from your 1Claw vault.
            <br />
            <span className="text-zinc-600 text-xs mt-1 block">
              Try: &quot;List my vaults&quot; or &quot;Get the OPENAI_KEY from my vault&quot;
            </span>
          </div>
        )}

        {messages.map((m) => (
          <div key={m.id} className="mb-4">
            <div className="flex items-start gap-3">
              <div
                className={`shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${
                  m.role === "user"
                    ? "bg-blue-600 text-white"
                    : "bg-emerald-600 text-white"
                }`}
              >
                {m.role === "user" ? "U" : "A"}
              </div>
              <div className="flex-1 min-w-0">
                {m.content && (
                  <p className="text-sm text-zinc-200 whitespace-pre-wrap">
                    {m.content}
                  </p>
                )}

                {m.toolInvocations?.map((t) => {
                  if (t.state !== "result") return null;
                  const result = t.result as Record<string, unknown>;

                  if (result.status === "available") {
                    return (
                      <SecretUsageCard
                        key={t.toolCallId}
                        hint={result.hint as string}
                      />
                    );
                  }

                  if (result.status === "pending_approval") {
                    return (
                      <div
                        key={t.toolCallId}
                        className="mt-2 px-3 py-2 rounded-lg bg-amber-900/30 border border-amber-700/40 text-amber-300 text-xs"
                      >
                        Waiting for human approval...
                      </div>
                    );
                  }

                  if (result.status === "ok" && result.vaults) {
                    const vaults = result.vaults as Array<{
                      id: string;
                      name: string;
                      description: string;
                    }>;
                    return (
                      <div
                        key={t.toolCallId}
                        className="mt-2 text-xs text-zinc-400 space-y-1"
                      >
                        {vaults.map((v) => (
                          <div
                            key={v.id}
                            className="px-3 py-2 rounded bg-zinc-800/50 border border-zinc-700/50"
                          >
                            <span className="text-zinc-200 font-medium">{v.name}</span>
                            {v.description && (
                              <span className="ml-2 text-zinc-500">{v.description}</span>
                            )}
                            <span className="ml-2 text-zinc-600 font-mono">{v.id}</span>
                          </div>
                        ))}
                      </div>
                    );
                  }

                  if (result.status === "ok" && result.keys) {
                    const keys = result.keys as Array<{
                      path: string;
                      type: string;
                      version: number;
                    }>;
                    return (
                      <div
                        key={t.toolCallId}
                        className="mt-2 text-xs text-zinc-400 space-y-1"
                      >
                        {keys.map((k) => (
                          <div
                            key={k.path}
                            className="px-3 py-1.5 rounded bg-zinc-800/50 border border-zinc-700/50 font-mono"
                          >
                            {k.path}{" "}
                            <span className="text-zinc-600">
                              ({k.type}, v{k.version})
                            </span>
                          </div>
                        ))}
                      </div>
                    );
                  }

                  if (result.status === "error") {
                    return (
                      <div
                        key={t.toolCallId}
                        className="mt-2 px-3 py-2 rounded-lg bg-red-900/30 border border-red-700/40 text-red-300 text-xs"
                      >
                        {result.message as string}
                      </div>
                    );
                  }

                  return null;
                })}
              </div>
            </div>
          </div>
        ))}

        {isLoading && (
          <div className="flex items-center gap-2 text-zinc-500 text-xs">
            <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
            Thinking...
          </div>
        )}

        <div ref={scrollRef} />
      </div>

      <form onSubmit={handleSubmit} className="flex gap-2">
        <input
          value={input}
          onChange={handleInputChange}
          placeholder="Ask the agent to access a vault secret..."
          className="flex-1 rounded-lg border border-zinc-700 bg-zinc-800 px-4 py-2.5 text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-emerald-600 focus:border-transparent"
        />
        <button
          type="submit"
          disabled={isLoading || !input.trim()}
          className="rounded-lg bg-emerald-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-emerald-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          Send
        </button>
      </form>
    </div>
  );
}
