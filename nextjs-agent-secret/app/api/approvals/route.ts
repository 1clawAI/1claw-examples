import { NextResponse } from "next/server";
import { oneclaw } from "@/lib/oneclaw";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status") ?? "pending";

  const res = await oneclaw.approvals.list(
    status as "pending" | "approved" | "denied",
  );

  if (res.error) {
    return NextResponse.json(
      { error: res.error.message },
      { status: res.meta?.status ?? 500 },
    );
  }

  return NextResponse.json(res.data);
}
