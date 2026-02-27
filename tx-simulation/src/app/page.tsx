"use client";

import { useChat, type Message } from "ai/react";
import { useEffect, useRef, useMemo } from "react";
import {
  Shield,
  ShieldAlert,
  Send,
  Bot,
  User,
  Zap,
  ExternalLink,
  XCircle,
  CheckCircle2,
  Loader2,
  AlertTriangle,
  ArrowRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn, truncateAddress } from "@/lib/utils";

interface TxEvent {
  id: string;
  tool: string;
  state: string;
  args: Record<string, unknown>;
  result?: Record<string, unknown>;
}

const TX_TOOLS = new Set([
  "submit_transaction",
  "simulate_transaction",
  "resolve_ens",
  "encode_token_transfer",
]);

function extractTxEvents(messages: Message[]): TxEvent[] {
  const events: TxEvent[] = [];
  for (const msg of messages) {
    if (msg.role !== "assistant" || !msg.toolInvocations) continue;
    for (const inv of msg.toolInvocations) {
      if (TX_TOOLS.has(inv.toolName)) {
        events.push({
          id: inv.toolCallId,
          tool: inv.toolName,
          state: inv.state,
          args: inv.args as Record<string, unknown>,
          result: inv.state === "result" ? (inv.result as Record<string, unknown>) : undefined,
        });
      }
    }
  }
  return events;
}

const SUGGESTED_PROMPTS = [
  { label: "Check my restrictions", text: "What transaction restrictions do I have?" },
  { label: "Try a blocked tx", text: "Send 1 ETH to 0x0000000000000000000000000000000000000001 on ethereum" },
  { label: "Tenderly: failing sim", text: "Simulate sending 1 million USDC to vitalik.eth on base — show me the Tenderly link when it reverts" },
  { label: "Send to ENS name", text: "Send vitalik.eth 0.0001 ETH on base" },
  { label: "Send USDC", text: "Send 0.01 USDC to vitalik.eth on base" },
  { label: "Send a valid tx", text: "Send 0.0001 ETH to the burn address on base" },
];

const TOOL_LOADING_LABELS: Record<string, string> = {
  simulate_transaction: "Simulating…",
  submit_transaction: "Submitting…",
  resolve_ens: "Resolving ENS name…",
  encode_token_transfer: "Encoding token transfer…",
};

function ToolResultCard({ inv }: { inv: TxEvent }) {
  if (!inv.result) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-zinc-700 bg-zinc-800/50 px-3 py-2 text-xs text-zinc-400">
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        {TOOL_LOADING_LABELS[inv.tool] || "Processing…"}
      </div>
    );
  }

  const r = inv.result;
  const status = r.status as string;
  const isBlocked = status === "blocked";
  const isError = status === "error";

  if (isBlocked) {
    return (
      <div className="animate-slide-in rounded-lg border border-red-500/30 bg-red-500/5 p-3 space-y-1">
        <div className="flex items-center gap-2">
          <XCircle className="h-4 w-4 text-red-400" />
          <span className="text-sm font-medium text-red-400">Transaction Blocked</span>
        </div>
        <p className="text-xs text-zinc-400">{r.reason as string}</p>
        <div className="flex gap-2 text-xs text-zinc-500">
          <span>{inv.args.chain as string}</span>
          <ArrowRight className="h-3 w-3" />
          <span className="font-mono">{truncateAddress(inv.args.to as string)}</span>
          <span>{inv.args.value as string} ETH</span>
        </div>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="animate-slide-in rounded-lg border border-amber-500/30 bg-amber-500/5 p-3">
        <div className="flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-amber-400" />
          <span className="text-sm font-medium text-amber-400">Error</span>
        </div>
        <p className="text-xs text-zinc-400 mt-1">{(r.reason || r.error) as string}</p>
      </div>
    );
  }

  if (inv.tool === "resolve_ens") {
    const resolved = status === "ok";
    return (
      <div className={cn(
        "animate-slide-in rounded-lg border p-3 space-y-1",
        resolved ? "border-purple-500/30 bg-purple-500/5" : "border-red-500/30 bg-red-500/5",
      )}>
        <div className="flex items-center gap-2">
          <span className="text-sm">{resolved ? "🔗" : "❌"}</span>
          <span className={cn("text-sm font-medium", resolved ? "text-purple-400" : "text-red-400")}>
            {resolved ? "ENS Resolved" : "ENS Resolution Failed"}
          </span>
        </div>
        <p className="text-xs text-zinc-400">
          {resolved
            ? <><span className="font-mono">{inv.args.name as string}</span> → <span className="font-mono">{truncateAddress(r.address as string)}</span></>
            : String(r.error)
          }
        </p>
      </div>
    );
  }

  if (inv.tool === "encode_token_transfer") {
    const encoded = status === "ok";
    return (
      <div className={cn(
        "animate-slide-in rounded-lg border p-3 space-y-1",
        encoded ? "border-cyan-500/30 bg-cyan-500/5" : "border-red-500/30 bg-red-500/5",
      )}>
        <div className="flex items-center gap-2">
          <span className="text-sm">{encoded ? "🪙" : "❌"}</span>
          <span className={cn("text-sm font-medium", encoded ? "text-cyan-400" : "text-red-400")}>
            {encoded ? `${r.token_symbol as string} Transfer Encoded` : "Token Encoding Failed"}
          </span>
          {encoded && <Badge variant="info" className="text-[10px]">ERC-20</Badge>}
        </div>
        <p className="text-xs text-zinc-400">
          {encoded
            ? `${inv.args.amount as string} ${(inv.args.token as string).toUpperCase()} → ${truncateAddress(inv.args.to as string)}`
            : String(r.error)
          }
        </p>
      </div>
    );
  }

  if (inv.tool === "simulate_transaction" && r.simulation) {
    const sim = r.simulation as Record<string, unknown>;
    const simResult = sim.result as string;
    const tenderlyUrl = sim.tenderly_url as string | undefined;
    const revertReason = (sim.revert_reason as string) || (sim.error as string);
    return (
      <div className={cn(
        "animate-slide-in rounded-lg border p-3 space-y-2",
        simResult === "success"
          ? "border-emerald-500/30 bg-emerald-500/5"
          : "border-red-500/30 bg-red-500/5",
      )}>
        <div className="flex items-center gap-2">
          {simResult === "success" ? (
            <CheckCircle2 className="h-4 w-4 text-emerald-400" />
          ) : (
            <XCircle className="h-4 w-4 text-red-400" />
          )}
          <span className={cn("text-sm font-medium", simResult === "success" ? "text-emerald-400" : "text-red-400")}>
            Simulation {simResult === "success" ? "Passed" : "Reverted"}
          </span>
          <Badge variant="info" className="text-[10px]">dry run</Badge>
        </div>
        <div className="text-xs text-zinc-400 space-y-0.5">
          <p>Gas: {String(sim.gas_used)} ({sim.gas_cost_usd ? `$${String(sim.gas_cost_usd)}` : "estimate unavailable"})</p>
          {revertReason ? <p className="text-red-400">Revert: {revertReason}</p> : null}
        </div>
        {tenderlyUrl ? (
          <a
            href={tenderlyUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 rounded-md bg-zinc-800 px-2.5 py-1.5 text-xs font-medium text-amber-400 hover:bg-zinc-700 hover:text-amber-300 border border-amber-500/20"
          >
            <ExternalLink className="h-3 w-3" />
            View simulation in Tenderly
          </a>
        ) : null}
      </div>
    );
  }

  if (inv.tool === "submit_transaction" && r.transaction) {
    const tx = r.transaction as Record<string, unknown>;
    const tenderlyUrl = tx.tenderly_dashboard_url as string | undefined;
    return (
      <div className="animate-slide-in rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-3 space-y-2">
        <div className="flex items-center gap-2">
          <CheckCircle2 className="h-4 w-4 text-emerald-400" />
          <span className="text-sm font-medium text-emerald-400">
            Transaction {tx.tx_status === "broadcast" ? "Broadcast" : "Signed"}
          </span>
          <Badge variant="success" className="text-[10px]">{tx.chain as string}</Badge>
        </div>
        <div className="text-xs text-zinc-400 space-y-0.5">
          <p className="font-mono">To: {truncateAddress(tx.to as string)}</p>
          <p>Value: {(Number(tx.value_wei as string) / 1e18).toFixed(8)} ETH</p>
          <div className="flex flex-wrap gap-2 mt-1.5">
            {tx.tx_hash ? (
              <a
                href={tx.explorer_url as string}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-blue-400 hover:text-blue-300"
              >
                <ExternalLink className="h-3 w-3" />
                View on block explorer
              </a>
            ) : null}
            {tenderlyUrl ? (
              <a
                href={tenderlyUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-amber-400 hover:text-amber-300"
              >
                <ExternalLink className="h-3 w-3" />
                View simulation in Tenderly
              </a>
            ) : null}
          </div>
        </div>
      </div>
    );
  }

  return null;
}

export default function Page() {
  const { messages, input, handleInputChange, handleSubmit, isLoading, append } =
    useChat({ maxSteps: 6 });

  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const txEvents = useMemo(() => extractTxEvents(messages), [messages]);

  const blockedCount = txEvents.filter(
    (e) => e.result && (e.result.status as string) === "blocked",
  ).length;
  const successCount = txEvents.filter(
    (e) =>
      e.result &&
      (e.result.status as string) === "ok" &&
      e.tool === "submit_transaction",
  ).length;

  return (
    <div className="flex h-screen flex-col">
      {/* Header */}
      <header className="flex items-center justify-between border-b border-zinc-800 px-6 py-3">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-500/20">
            <Shield className="h-4 w-4 text-amber-400" />
          </div>
          <div>
            <h1 className="text-sm font-semibold">1Claw Intents API</h1>
            <p className="text-xs text-zinc-500">AI Agent Demo — Guardrails & Simulation</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Badge variant="destructive" className="gap-1">
            <XCircle className="h-3 w-3" />
            {blockedCount} blocked
          </Badge>
          <Badge variant="success" className="gap-1">
            <CheckCircle2 className="h-3 w-3" />
            {successCount} signed
          </Badge>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* Chat Panel */}
        <div className="flex flex-1 flex-col border-r border-zinc-800">
          <ScrollArea className="flex-1">
            <div ref={scrollRef} className="space-y-4 p-4 pb-4 overflow-y-auto h-full scrollbar-thin">
              {messages.length === 0 && (
                <div className="flex flex-col items-center justify-center h-full min-h-[400px] gap-6">
                  <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-zinc-800">
                    <Bot className="h-8 w-8 text-zinc-400" />
                  </div>
                  <div className="text-center space-y-2">
                    <h2 className="text-lg font-medium">Intents API Agent</h2>
                    <p className="text-sm text-zinc-500 max-w-md">
                      I can sign and broadcast on-chain transactions through 1Claw&apos;s Intents API.
                      My wallet is protected by guardrails — try asking me to send a transaction.
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2 justify-center">
                    {SUGGESTED_PROMPTS.map((p) => (
                      <Button
                        key={p.label}
                        variant="outline"
                        size="sm"
                        className="text-xs"
                        onClick={() => append({ role: "user", content: p.text })}
                      >
                        {p.label}
                      </Button>
                    ))}
                  </div>
                </div>
              )}

              {messages.map((msg) => {
                if (msg.role === "user") {
                  return (
                    <div key={msg.id} className="flex justify-end animate-slide-in">
                      <div className="flex items-start gap-2 max-w-[80%]">
                        <div className="rounded-2xl rounded-tr-md bg-blue-600 px-4 py-2.5">
                          <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                        </div>
                        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-blue-600/20">
                          <User className="h-3.5 w-3.5 text-blue-400" />
                        </div>
                      </div>
                    </div>
                  );
                }

                if (msg.role === "assistant") {
                  const toolInvs = msg.toolInvocations || [];
                  const txInvs = toolInvs.filter((i) => TX_TOOLS.has(i.toolName));

                  return (
                    <div key={msg.id} className="flex justify-start animate-slide-in">
                      <div className="flex items-start gap-2 max-w-[85%]">
                        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-amber-500/20 mt-0.5">
                          <Bot className="h-3.5 w-3.5 text-amber-400" />
                        </div>
                        <div className="space-y-2">
                          {txInvs.map((inv) => (
                            <ToolResultCard
                              key={inv.toolCallId}
                              inv={{
                                id: inv.toolCallId,
                                tool: inv.toolName,
                                state: inv.state,
                                args: inv.args as Record<string, unknown>,
                                result: inv.state === "result" ? (inv.result as Record<string, unknown>) : undefined,
                              }}
                            />
                          ))}
                          {msg.content && (
                            <div className="rounded-2xl rounded-tl-md bg-zinc-800 px-4 py-2.5">
                              <p className="text-sm whitespace-pre-wrap leading-relaxed">{msg.content}</p>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                }

                return null;
              })}

              {isLoading && messages[messages.length - 1]?.role === "user" && (
                <div className="flex justify-start animate-slide-in">
                  <div className="flex items-start gap-2">
                    <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-amber-500/20">
                      <Bot className="h-3.5 w-3.5 text-amber-400" />
                    </div>
                    <div className="rounded-2xl rounded-tl-md bg-zinc-800 px-4 py-2.5">
                      <div className="flex items-center gap-2 text-sm text-zinc-400">
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        Thinking…
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </ScrollArea>

          {/* Input */}
          <div className="border-t border-zinc-800 p-4">
            <form onSubmit={handleSubmit} className="flex gap-2">
              <Input
                value={input}
                onChange={handleInputChange}
                placeholder="Ask me to send a transaction…"
                disabled={isLoading}
                autoFocus
              />
              <Button type="submit" disabled={isLoading || !input.trim()} size="icon">
                <Send className="h-4 w-4" />
              </Button>
            </form>
          </div>
        </div>

        {/* Transaction Panel */}
        <div className="w-80 lg:w-96 flex flex-col overflow-y-auto scrollbar-thin bg-zinc-900/40 p-4 space-y-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2">
                <ShieldAlert className="h-4 w-4 text-amber-400" />
                Agent Guardrails
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <p className="text-xs text-zinc-500 mb-3">
                These restrictions are configured by the wallet owner and enforced server-side before
                any transaction is signed.
              </p>
              <GuardrailRow label="Chains" value="base" />
              <GuardrailRow label="Max / tx" value="0.001 ETH" />
              <GuardrailRow label="Daily limit" value="0.005 ETH" />
              <GuardrailRow label="Destinations" value="0x…dEaD, 0x…90F4" />
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2">
                <Zap className="h-4 w-4 text-blue-400" />
                Transaction Log
              </CardTitle>
            </CardHeader>
            <CardContent>
              {txEvents.length === 0 ? (
                <p className="text-xs text-zinc-500 text-center py-6">
                  No transactions yet. Ask the agent to send one.
                </p>
              ) : (
                <div className="space-y-2">
                  {txEvents.map((ev) => (
                    <TxLogEntry key={ev.id} event={ev} />
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-xs text-zinc-500 font-normal">How it works</CardTitle>
            </CardHeader>
            <CardContent>
              <ol className="space-y-2 text-xs text-zinc-500">
                <li className="flex gap-2">
                  <span className="shrink-0 flex h-5 w-5 items-center justify-center rounded-full bg-zinc-800 text-[10px] font-medium text-zinc-400">1</span>
                  <span>Agent submits a transaction intent to 1Claw</span>
                </li>
                <li className="flex gap-2">
                  <span className="shrink-0 flex h-5 w-5 items-center justify-center rounded-full bg-zinc-800 text-[10px] font-medium text-zinc-400">2</span>
                  <span>Guardrails check chain, address, and value limits</span>
                </li>
                <li className="flex gap-2">
                  <span className="shrink-0 flex h-5 w-5 items-center justify-center rounded-full bg-zinc-800 text-[10px] font-medium text-zinc-400">3</span>
                  <span>If valid, the server signs with the HSM-backed key</span>
                </li>
                <li className="flex gap-2">
                  <span className="shrink-0 flex h-5 w-5 items-center justify-center rounded-full bg-zinc-800 text-[10px] font-medium text-zinc-400">4</span>
                  <span>Transaction is broadcast — the agent never sees the private key</span>
                </li>
              </ol>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function GuardrailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-xs text-zinc-500">{label}</span>
      <span className="text-xs font-mono text-amber-400">{value}</span>
    </div>
  );
}

function TxLogEntry({ event }: { event: TxEvent }) {
  const r = event.result;
  if (!r) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-zinc-700 bg-zinc-800/50 px-2.5 py-2 animate-pulse">
        <Loader2 className="h-3 w-3 animate-spin text-zinc-500" />
        <span className="text-[11px] text-zinc-500">
          {event.tool === "simulate_transaction" ? "Simulating" : "Submitting"}…
        </span>
      </div>
    );
  }

  const status = r.status as string;

  if (status === "blocked") {
    return (
      <div className="animate-slide-in flex items-start gap-2 rounded-lg border border-red-500/20 bg-red-500/5 px-2.5 py-2">
        <XCircle className="h-3.5 w-3.5 text-red-400 mt-0.5 shrink-0" />
        <div className="min-w-0">
          <p className="text-[11px] font-medium text-red-400">Blocked</p>
          <p className="text-[10px] text-zinc-500 truncate">
            {event.args.chain as string} → {truncateAddress(event.args.to as string)} · {event.args.value as string} ETH
          </p>
        </div>
      </div>
    );
  }

  if (status === "ok" && event.tool === "submit_transaction") {
    const tx = r.transaction as Record<string, unknown>;
    const tenderlyUrl = tx?.tenderly_dashboard_url as string | undefined;
    return (
      <div className="animate-slide-in flex items-start gap-2 rounded-lg border border-emerald-500/20 bg-emerald-500/5 px-2.5 py-2">
        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400 mt-0.5 shrink-0" />
        <div className="min-w-0">
          <p className="text-[11px] font-medium text-emerald-400">
            {(tx?.tx_status as string) === "broadcast" ? "Broadcast" : "Signed"}
          </p>
          <p className="text-[10px] text-zinc-500 truncate">
            {tx?.chain as string} → {truncateAddress(tx?.to as string || "")}
          </p>
          <div className="flex flex-wrap gap-x-2 gap-y-0.5 mt-0.5">
            {tx?.tx_hash ? (
              <a
                href={tx.explorer_url as string}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[10px] text-blue-400 hover:underline inline-flex items-center gap-0.5"
              >
                <ExternalLink className="h-2.5 w-2.5" />
                {String(tx.tx_hash).slice(0, 16)}…
              </a>
            ) : null}
            {tenderlyUrl ? (
              <a
                href={tenderlyUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[10px] text-amber-400 hover:text-amber-300 inline-flex items-center gap-0.5"
              >
                <ExternalLink className="h-2.5 w-2.5" />
                View in Tenderly
              </a>
            ) : null}
          </div>
        </div>
      </div>
    );
  }

  if (status === "ok" && event.tool === "simulate_transaction") {
    const sim = r.simulation as Record<string, unknown>;
    const passed = (sim?.result as string) === "success";
    const tenderlyUrl = sim?.tenderly_url as string | undefined;
    return (
      <div className={cn(
        "animate-slide-in flex flex-col gap-1 rounded-lg border px-2.5 py-2",
        passed ? "border-blue-500/20 bg-blue-500/5" : "border-red-500/20 bg-red-500/5",
      )}>
        <div className="flex items-start gap-2">
          <Zap className={cn("h-3.5 w-3.5 mt-0.5 shrink-0", passed ? "text-blue-400" : "text-red-400")} />
          <div className="min-w-0">
            <p className={cn("text-[11px] font-medium", passed ? "text-blue-400" : "text-red-400")}>
              Sim {passed ? "passed" : "reverted"}
            </p>
            <p className="text-[10px] text-zinc-500">Gas: {String(sim?.gas_used)}</p>
          </div>
        </div>
        {tenderlyUrl ? (
          <a
            href={tenderlyUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[10px] text-amber-400 hover:text-amber-300 inline-flex items-center gap-0.5"
          >
            <ExternalLink className="h-2.5 w-2.5" />
            View in Tenderly
          </a>
        ) : null}
      </div>
    );
  }

  if (event.tool === "resolve_ens") {
    const resolved = status === "ok";
    return (
      <div className={cn(
        "animate-slide-in flex items-start gap-2 rounded-lg border px-2.5 py-2",
        resolved ? "border-purple-500/20 bg-purple-500/5" : "border-red-500/20 bg-red-500/5",
      )}>
        <span className="text-[13px] mt-0.5 shrink-0">{resolved ? "🔗" : "❌"}</span>
        <div className="min-w-0">
          <p className={cn("text-[11px] font-medium", resolved ? "text-purple-400" : "text-red-400")}>
            {resolved ? "ENS Resolved" : "ENS Failed"}
          </p>
          <p className="text-[10px] text-zinc-500 truncate">
            {event.args.name as string} → {resolved ? truncateAddress(r.address as string) : (r.error as string)}
          </p>
        </div>
      </div>
    );
  }

  if (event.tool === "encode_token_transfer") {
    const encoded = status === "ok";
    return (
      <div className={cn(
        "animate-slide-in flex items-start gap-2 rounded-lg border px-2.5 py-2",
        encoded ? "border-cyan-500/20 bg-cyan-500/5" : "border-red-500/20 bg-red-500/5",
      )}>
        <span className="text-[13px] mt-0.5 shrink-0">{encoded ? "🪙" : "❌"}</span>
        <div className="min-w-0">
          <p className={cn("text-[11px] font-medium", encoded ? "text-cyan-400" : "text-red-400")}>
            {encoded ? `${r.token_symbol as string} Transfer` : "Encode Failed"}
          </p>
          <p className="text-[10px] text-zinc-500 truncate">
            {encoded
              ? `${event.args.amount as string} ${(event.args.token as string).toUpperCase()} → ${truncateAddress(event.args.to as string)}`
              : (r.error as string)
            }
          </p>
        </div>
      </div>
    );
  }

  return null;
}
