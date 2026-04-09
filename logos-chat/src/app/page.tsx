"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
    Lock,
    Unlock,
    Bot,
    Send,
    Loader2,
    ShieldCheck,
    Key,
} from "lucide-react";

interface EncryptedEnvelope {
    ciphertext: string;
    iv: string;
    authTag: string;
    signature: string;
    senderEcdhPublic: string;
    senderSignPublic: string;
    signKeyType: string;
}

interface ChatEntry {
    id: string;
    from: "Alice" | "Bob";
    timestamp: number;
    encrypted: EncryptedEnvelope;
    decrypted: string;
}

interface AgentMeta {
    name: string;
    ecdhPublic: string;
    signPublic: string;
    signKeyType: string;
}

interface ConversationMessage {
    role: "user" | "assistant";
    content: string;
}

function truncate(s: string, n: number): string {
    return s.length > n ? s.slice(0, n) + "…" : s;
}

function EncryptedBubble({ msg }: { msg: ChatEntry }) {
    const e = msg.encrypted;
    return (
        <div className="space-y-1 font-mono text-xs leading-relaxed break-all">
            <div>
                <span className="text-[var(--text-muted)]">ciphertext: </span>
                {truncate(e.ciphertext, 48)}
            </div>
            <div>
                <span className="text-[var(--text-muted)]">iv: </span>
                {e.iv}
            </div>
            <div>
                <span className="text-[var(--text-muted)]">tag: </span>
                {e.authTag}
            </div>
            <div>
                <span className="text-[var(--text-muted)]">sig: </span>
                {truncate(e.signature, 48)}
            </div>
        </div>
    );
}

function DecryptedBubble({ msg }: { msg: ChatEntry }) {
    return <p className="text-sm leading-relaxed whitespace-pre-wrap">{msg.decrypted}</p>;
}

export default function ChatPage() {
    const [messages, setMessages] = useState<ChatEntry[]>([]);
    const [agents, setAgents] = useState<{ alice: AgentMeta; bob: AgentMeta } | null>(null);
    const [showDecrypted, setShowDecrypted] = useState(false);
    const [autoChat, setAutoChat] = useState(false);
    const [loading, setLoading] = useState(true);
    const [sending, setSending] = useState(false);
    const [aiWorking, setAiWorking] = useState(false);
    const [aliceText, setAliceText] = useState("");
    const [bobText, setBobText] = useState("");
    const [error, setError] = useState<string | null>(null);
    const [provisionedWithMasterKey, setProvisionedWithMasterKey] = useState(false);
    const scrollRef = useRef<HTMLDivElement>(null);
    const autoChatRef = useRef(false);
    const aiTurnRef = useRef<"Alice" | "Bob">("Alice");

    useEffect(() => {
        autoChatRef.current = autoChat;
    }, [autoChat]);

    const scrollToBottom = useCallback(() => {
        setTimeout(() => scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" }), 50);
    }, []);

    useEffect(() => {
        (async () => {
            try {
                const res = await fetch("/api/setup", { method: "POST" });
                const data = await res.json();
                if (!data.ok) throw new Error(data.error);
                setAgents(data.agents);
                setProvisionedWithMasterKey(Boolean(data.provisionedWithMasterKey));
            } catch (err: unknown) {
                setError(err instanceof Error ? err.message : "Failed to initialize agents");
            } finally {
                setLoading(false);
            }
        })();
    }, []);

    const sendMessage = useCallback(
        async (from: "Alice" | "Bob", text: string) => {
            if (!text.trim()) return;
            setSending(true);
            try {
                const res = await fetch("/api/send", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ from, text: text.trim() }),
                });
                const data = await res.json();
                if (!data.ok) throw new Error(data.error);
                setMessages((prev) => [...prev, data.message]);
                scrollToBottom();
                return data.message as ChatEntry;
            } catch (err: unknown) {
                setError(err instanceof Error ? err.message : "Send failed");
                return null;
            } finally {
                setSending(false);
            }
        },
        [scrollToBottom],
    );

    const buildHistory = useCallback(
        (agentName: "Alice" | "Bob"): ConversationMessage[] => {
            return messages.map((m) => ({
                role: (m.from === agentName ? "assistant" : "user") as "user" | "assistant",
                content: m.decrypted,
            }));
        },
        [messages],
    );

    const sendAiMessage = useCallback(
        async (agent: "Alice" | "Bob") => {
            setAiWorking(true);
            try {
                const history = buildHistory(agent);
                const res = await fetch("/api/ai-message", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ agent, history }),
                });
                const data = await res.json();
                if (!data.ok) {
                    if (data.error?.includes("LLM not configured")) {
                        setAutoChat(false);
                        setError(
                            "AI auto-chat needs Alice/Bob agent IDs and API keys (bootstrap). LLM_API_KEY is optional (BYOK); leave unset for Shroud LLM token billing.",
                        );
                        return null;
                    }
                    throw new Error(data.error);
                }
                setMessages((prev) => [...prev, data.message]);
                scrollToBottom();
                return data.message as ChatEntry;
            } catch (err: unknown) {
                setError(err instanceof Error ? err.message : "AI message failed");
                return null;
            } finally {
                setAiWorking(false);
            }
        },
        [buildHistory, scrollToBottom],
    );

    /** Stable ref so auto-chat loop does not restart on every new message (avoids overlapping sends). */
    const sendAiMessageRef = useRef(sendAiMessage);
    sendAiMessageRef.current = sendAiMessage;

    useEffect(() => {
        if (!autoChat || !agents) return;

        let cancelled = false;

        const loop = async () => {
            while (!cancelled && autoChatRef.current) {
                const speaker = aiTurnRef.current;
                const result = await sendAiMessageRef.current(speaker);
                if (!result || cancelled || !autoChatRef.current) break;

                aiTurnRef.current = speaker === "Alice" ? "Bob" : "Alice";

                await new Promise((r) => setTimeout(r, 3000));
                if (cancelled || !autoChatRef.current) break;

                const replier = aiTurnRef.current;
                const replyResult = await sendAiMessageRef.current(replier);
                if (!replyResult || cancelled || !autoChatRef.current) break;

                aiTurnRef.current = replier === "Alice" ? "Bob" : "Alice";

                await new Promise((r) => setTimeout(r, 12000));
            }
        };

        loop();
        return () => { cancelled = true; };
    }, [autoChat, agents]);

    if (loading) {
        return (
            <div className="flex h-screen items-center justify-center">
                <Loader2 className="h-8 w-8 animate-spin text-[var(--accent)]" />
                <span className="ml-3 text-[var(--text-muted)]">Initializing agents…</span>
            </div>
        );
    }

    return (
        <div className="flex h-screen flex-col">
            {/* Header */}
            <header className="flex items-center justify-between border-b border-[var(--border)] px-6 py-3">
                <div className="flex items-center gap-3">
                    <ShieldCheck className="h-5 w-5 text-[var(--accent)]" />
                    <h1 className="text-lg font-semibold tracking-tight">
                        1Claw <span className="text-[var(--text-muted)]">×</span> Logos
                        <span className="ml-2 text-sm font-normal text-[var(--text-muted)]">
                            Encrypted Agent Chat
                        </span>
                    </h1>
                </div>
                <div className="flex items-center gap-4">
                    {/* Encrypted / Decrypted toggle */}
                    <button
                        onClick={() => setShowDecrypted(!showDecrypted)}
                        className="flex items-center gap-2 rounded-lg border border-[var(--border)] px-3 py-1.5 text-sm transition-colors hover:bg-[var(--surface-hover)]"
                    >
                        {showDecrypted ? (
                            <Unlock className="h-4 w-4 text-[var(--bob)]" />
                        ) : (
                            <Lock className="h-4 w-4 text-[var(--alice)]" />
                        )}
                        {showDecrypted ? "Decrypted" : "Encrypted"}
                    </button>

                    {/* AI auto-chat toggle */}
                    <button
                        onClick={() => setAutoChat(!autoChat)}
                        className={`flex items-center gap-2 rounded-lg border px-3 py-1.5 text-sm transition-colors ${
                            autoChat
                                ? "border-[var(--accent)] bg-[var(--accent)]/10 text-[var(--accent)]"
                                : "border-[var(--border)] hover:bg-[var(--surface-hover)]"
                        }`}
                    >
                        <Bot className="h-4 w-4" />
                        AI Auto-Chat{autoChat ? ": ON" : ""}
                        {aiWorking && <Loader2 className="ml-1 h-3 w-3 animate-spin" />}
                    </button>
                </div>
            </header>

            {/* Agent info bar */}
            {agents && (
                <div className="flex items-center gap-6 border-b border-[var(--border)] px-6 py-2 text-xs text-[var(--text-muted)]">
                    <div className="flex items-center gap-1.5">
                        <Key className="h-3 w-3 text-[var(--alice)]" />
                        <span className="font-medium text-[var(--alice)]">Alice</span>
                        <span className="ml-1">ECDH: {truncate(agents.alice.ecdhPublic, 16)}</span>
                        <span className="ml-2">{agents.alice.signKeyType.toUpperCase()}: {truncate(agents.alice.signPublic, 16)}</span>
                    </div>
                    <div className="h-3 w-px bg-[var(--border)]" />
                    <div className="flex items-center gap-1.5">
                        <Key className="h-3 w-3 text-[var(--bob)]" />
                        <span className="font-medium text-[var(--bob)]">Bob</span>
                        <span className="ml-1">ECDH: {truncate(agents.bob.ecdhPublic, 16)}</span>
                        <span className="ml-2">{agents.bob.signKeyType.toUpperCase()}: {truncate(agents.bob.signPublic, 16)}</span>
                    </div>
                </div>
            )}

            {/* Error banner */}
            {error && (
                <div className="mx-6 mt-3 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-2 text-sm text-red-400">
                    {error}
                    <button onClick={() => setError(null)} className="ml-3 underline">dismiss</button>
                </div>
            )}

            {provisionedWithMasterKey && (
                <div className="mx-6 mt-3 rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-2 text-sm text-amber-200/90">
                    Created Alice and Bob in your 1Claw org from <code className="rounded bg-black/20 px-1">ONECLAW_API_KEY</code>.
                    Run <code className="rounded bg-black/20 px-1">npm run bootstrap</code> to write a stable <code className="rounded bg-black/20 px-1">.env</code> so new agents are not created on every server restart.
                </div>
            )}

            {/* Messages */}
            <div ref={scrollRef} className="flex-1 overflow-y-auto px-6 py-4 scrollbar-thin">
                {messages.length === 0 && (
                    <div className="flex h-full flex-col items-center justify-center text-[var(--text-muted)]">
                        <Lock className="mb-3 h-10 w-10 opacity-30" />
                        <p className="text-sm">No messages yet. Send one below or enable AI Auto-Chat.</p>
                    </div>
                )}
                <div className="mx-auto max-w-2xl space-y-3">
                    {messages.map((msg) => {
                        const isAlice = msg.from === "Alice";
                        return (
                            <div
                                key={msg.id}
                                className={`flex animate-fade-in ${isAlice ? "justify-start" : "justify-end"}`}
                            >
                                <div
                                    className={`max-w-[80%] rounded-xl px-4 py-3 ${
                                        isAlice
                                            ? "bg-[var(--alice-bg)] border border-[var(--alice)]/20"
                                            : "bg-[var(--bob-bg)] border border-[var(--bob)]/20"
                                    }`}
                                >
                                    <div className="mb-1.5 flex items-center gap-2">
                                        <span
                                            className={`text-xs font-semibold ${
                                                isAlice ? "text-[var(--alice)]" : "text-[var(--bob)]"
                                            }`}
                                        >
                                            {msg.from}
                                        </span>
                                        <span className="text-[10px] text-[var(--text-muted)]">
                                            {new Date(msg.timestamp).toLocaleTimeString()}
                                        </span>
                                        {!showDecrypted && (
                                            <Lock className="h-3 w-3 text-[var(--text-muted)]" />
                                        )}
                                    </div>
                                    {showDecrypted ? (
                                        <DecryptedBubble msg={msg} />
                                    ) : (
                                        <EncryptedBubble msg={msg} />
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* Input area */}
            <div className="border-t border-[var(--border)] px-6 py-3">
                <div className="mx-auto flex max-w-2xl gap-3">
                    {/* Alice input */}
                    <div className="flex flex-1 items-center gap-2">
                        <span className="text-xs font-semibold text-[var(--alice)]">Alice</span>
                        <input
                            value={aliceText}
                            onChange={(e) => setAliceText(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === "Enter" && !e.shiftKey) {
                                    e.preventDefault();
                                    sendMessage("Alice", aliceText).then(() => setAliceText(""));
                                }
                            }}
                            placeholder="Type as Alice…"
                            disabled={sending || !agents}
                            className="flex-1 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm outline-none transition-colors placeholder:text-[var(--text-muted)] focus:border-[var(--alice)]/50 disabled:opacity-50"
                        />
                        <button
                            onClick={() => sendMessage("Alice", aliceText).then(() => setAliceText(""))}
                            disabled={sending || !aliceText.trim() || !agents}
                            className="rounded-lg bg-[var(--alice)]/20 p-2 text-[var(--alice)] transition-colors hover:bg-[var(--alice)]/30 disabled:opacity-30"
                        >
                            <Send className="h-4 w-4" />
                        </button>
                    </div>

                    <div className="w-px bg-[var(--border)]" />

                    {/* Bob input */}
                    <div className="flex flex-1 items-center gap-2">
                        <span className="text-xs font-semibold text-[var(--bob)]">Bob</span>
                        <input
                            value={bobText}
                            onChange={(e) => setBobText(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === "Enter" && !e.shiftKey) {
                                    e.preventDefault();
                                    sendMessage("Bob", bobText).then(() => setBobText(""));
                                }
                            }}
                            placeholder="Type as Bob…"
                            disabled={sending || !agents}
                            className="flex-1 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm outline-none transition-colors placeholder:text-[var(--text-muted)] focus:border-[var(--bob)]/50 disabled:opacity-50"
                        />
                        <button
                            onClick={() => sendMessage("Bob", bobText).then(() => setBobText(""))}
                            disabled={sending || !bobText.trim() || !agents}
                            className="rounded-lg bg-[var(--bob)]/20 p-2 text-[var(--bob)] transition-colors hover:bg-[var(--bob)]/30 disabled:opacity-30"
                        >
                            <Send className="h-4 w-4" />
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
