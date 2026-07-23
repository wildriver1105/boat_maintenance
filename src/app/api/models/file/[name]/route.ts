// 업로드된 GLB 파일 서빙 — 레지스트리에 등록된 파일명만 허용
import { promises as fs } from "fs";
import { NextResponse } from "next/server";
import { modelFilePath } from "@/lib/models3d/registry";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ name: string }> },
) {
  const { name } = await ctx.params;
  const p = await modelFilePath(name);
  if (!p) return NextResponse.json({ error: "not found" }, { status: 404 });
  const buf = await fs.readFile(p).catch(() => null);
  if (!buf) return NextResponse.json({ error: "not found" }, { status: 404 });
  return new NextResponse(new Uint8Array(buf), {
    headers: {
      "Content-Type": "model/gltf-binary",
      "Cache-Control": "private, max-age=3600",
    },
  });
}
