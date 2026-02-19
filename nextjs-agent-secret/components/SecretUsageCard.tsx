"use client";

export function SecretUsageCard({ hint }: { hint: string }) {
  return (
    <div className="mt-2 rounded-lg border border-emerald-700/40 bg-emerald-900/20 px-3 py-2">
      <div className="flex items-center gap-2">
        <div className="w-2 h-2 rounded-full bg-emerald-500" />
        <span className="text-xs font-medium text-emerald-300">
          Secret Retrieved
        </span>
      </div>
      <p className="mt-1 text-xs text-emerald-300/70">{hint}</p>
      <p className="mt-0.5 text-xs text-zinc-500">
        Value is used server-side only — never exposed to the client or model.
      </p>
    </div>
  );
}
