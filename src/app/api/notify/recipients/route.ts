// 알림 수신자(User Key) 관리 — 관리자 전용. 키는 마스킹해서 반환.
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import {
  addRecipient,
  deleteRecipient,
  listRecipients,
  maskKey,
  updateRecipient,
} from "@/lib/notifications/recipients";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function requireAdmin() {
  const session = await auth();
  return session?.user?.role === "admin" ? session : null;
}

export async function GET() {
  if (!(await requireAdmin()))
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const rs = await listRecipients();
  return NextResponse.json(
    rs.map((r) => ({ id: r.id, label: r.label, keyMasked: maskKey(r.userKey), enabled: r.enabled })),
  );
}

export async function POST(req: Request) {
  if (!(await requireAdmin()))
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const body = (await req.json()) as { label?: string; userKey?: string };
  if (!body.userKey?.trim())
    return NextResponse.json({ error: "userKey 필수" }, { status: 400 });
  try {
    const r = await addRecipient(body.label ?? "", body.userKey);
    return NextResponse.json({ id: r.id, label: r.label, keyMasked: maskKey(r.userKey), enabled: r.enabled }, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 409 });
  }
}

export async function PUT(req: Request) {
  if (!(await requireAdmin()))
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const body = (await req.json()) as { id?: string; label?: string; enabled?: boolean };
  if (!body.id) return NextResponse.json({ error: "id 필수" }, { status: 400 });
  const { id, ...patch } = body;
  const r = await updateRecipient(id, patch);
  if (!r) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({ id: r.id, label: r.label, keyMasked: maskKey(r.userKey), enabled: r.enabled });
}

export async function DELETE(req: Request) {
  if (!(await requireAdmin()))
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id 필수" }, { status: 400 });
  const ok = await deleteRecipient(id);
  if (!ok) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
