import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function truncateAddress(addr: string, chars = 6): string {
  if (addr.length <= chars * 2 + 2) return addr;
  return `${addr.slice(0, chars + 2)}…${addr.slice(-chars)}`;
}

export function formatEth(wei: string | number): string {
  const val = typeof wei === "string" ? parseFloat(wei) : wei;
  if (val === 0) return "0 ETH";
  if (val < 0.000001) return `${val.toExponential(2)} ETH`;
  return `${val} ETH`;
}
