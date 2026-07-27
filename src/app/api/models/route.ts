// 임포트 3D 모델(GLB) CRUD — 업로드는 multipart/form-data (file, name)
import { NextResponse } from "next/server";
import {
  addModel,
  deleteModel,
  listModels,
  updateModel,
  type ImportedModel,
} from "@/lib/models3d/registry";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BYTES = 100 * 1024 * 1024; // 100MB

export async function GET() {
  return NextResponse.json(await listModels());
}

export async function POST(req: Request) {
  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!form || !(file instanceof File)) {
    return NextResponse.json({ error: "file 필드(multipart) 필요" }, { status: 400 });
  }
  const lower = file.name.toLowerCase();
  if (!lower.endsWith(".glb")) {
    return NextResponse.json({ error: ".glb 파일만 지원합니다" }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: "100MB 이하만 업로드 가능" }, { status: 413 });
  }
  const name = String(form.get("name") ?? file.name.replace(/\.glb$/i, ""));
  const buf = Buffer.from(await file.arrayBuffer());
  // GLB 매직 넘버 검사 ("glTF")
  if (buf.length < 12 || buf.toString("ascii", 0, 4) !== "glTF") {
    return NextResponse.json({ error: "유효한 GLB 파일이 아닙니다" }, { status: 400 });
  }
  const model = await addModel(name, buf);
  return NextResponse.json(model, { status: 201 });
}

export async function PUT(req: Request) {
  const body = (await req.json()) as Partial<ImportedModel> & { id?: string };
  if (!body.id) return NextResponse.json({ error: "id 필요" }, { status: 400 });
  const { id, ...patch } = body;
  const m = await updateModel(id, patch);
  if (!m) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json(m);
}

export async function DELETE(req: Request) {
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id 필요" }, { status: 400 });
  const ok = await deleteModel(id);
  if (!ok) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
