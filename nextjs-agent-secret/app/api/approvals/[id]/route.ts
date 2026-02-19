import { NextResponse } from "next/server";
import { oneclaw } from "@/lib/oneclaw";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const body = await req.json();
  const action = body.action as "approve" | "deny";

  const res =
    action === "approve"
      ? await oneclaw.approvals.approve(id)
      : await oneclaw.approvals.deny(id, body.reason);

  if (res.error) {
    return NextResponse.json(
      { error: res.error.message },
      { status: res.meta?.status ?? 500 },
    );
  }

  return NextResponse.json(res.data);
}
