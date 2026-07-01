// 크루 계정 관리 API — 관리자 전용.
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { listUsers, createUser, deleteUser, type Role } from "@/lib/users/registry";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function requireAdmin() {
  const session = await auth();
  return session?.user?.role === "admin" ? session : null;
}

export async function GET() {
  if (!(await requireAdmin()))
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  return NextResponse.json(await listUsers());
}

export async function POST(req: Request) {
  if (!(await requireAdmin()))
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const body = (await req.json()) as {
    email?: string;
    name?: string;
    role?: Role;
    password?: string;
  };
  if (!body.email || !body.name || !body.password) {
    return NextResponse.json({ error: "email, name, password 필수" }, { status: 400 });
  }
  try {
    const user = await createUser({
      email: body.email,
      name: body.name,
      role: body.role === "admin" ? "admin" : "crew",
      password: body.password,
    });
    return NextResponse.json(user, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 409 });
  }
}

export async function DELETE(req: Request) {
  if (!(await requireAdmin()))
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  try {
    const ok = await deleteUser(id);
    if (!ok) return NextResponse.json({ error: "not found" }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 409 });
  }
}
