"use client";

import { useEffect, useState, useCallback } from "react";

interface Approval {
  id: string;
  vault_id: string;
  secret_path: string;
  reason?: string;
  status: string;
}

export function ApprovalBanner() {
  const [approvals, setApprovals] = useState<Approval[]>([]);
  const [acting, setActing] = useState<string | null>(null);

  const fetchApprovals = useCallback(async () => {
    try {
      const res = await fetch("/api/approvals?status=pending");
      if (res.ok) {
        const data = await res.json();
        setApprovals(data.approvals ?? []);
      }
    } catch {
      /* retry on next poll */
    }
  }, []);

  useEffect(() => {
    fetchApprovals();
    const interval = setInterval(fetchApprovals, 3000);
    return () => clearInterval(interval);
  }, [fetchApprovals]);

  const handleAction = async (id: string, action: "approve" | "deny") => {
    setActing(id);
    try {
      await fetch(`/api/approvals/${id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      setApprovals((prev) => prev.filter((a) => a.id !== id));
    } catch {
      /* will show again on next poll */
    } finally {
      setActing(null);
    }
  };

  if (approvals.length === 0) return null;

  return (
    <div className="space-y-2">
      {approvals.map((a) => (
        <div
          key={a.id}
          className="flex items-center justify-between gap-4 rounded-lg border border-amber-700/40 bg-amber-900/20 px-4 py-3"
        >
          <div className="min-w-0">
            <p className="text-sm font-medium text-amber-200">
              Approval Required
            </p>
            <p className="text-xs text-amber-300/70 truncate">
              Secret: <span className="font-mono">{a.secret_path}</span>
              {a.reason && <> &mdash; {a.reason}</>}
            </p>
          </div>
          <div className="flex gap-2 shrink-0">
            <button
              onClick={() => handleAction(a.id, "approve")}
              disabled={acting === a.id}
              className="rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-500 disabled:opacity-40 transition-colors"
            >
              Approve
            </button>
            <button
              onClick={() => handleAction(a.id, "deny")}
              disabled={acting === a.id}
              className="rounded-md bg-zinc-700 px-3 py-1.5 text-xs font-medium text-zinc-300 hover:bg-zinc-600 disabled:opacity-40 transition-colors"
            >
              Deny
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
