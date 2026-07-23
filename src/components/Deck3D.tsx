// 3D 뷰 컨테이너 — Canvas + 섹션 내비게이션 + 레이어 토글 + GLB 임포트/엑스포트.
// 오버뷰에서는 줌 거리에 따라 외장↔내부가 자동 전환되고,
// 섹션 칩을 누르면 카메라가 이동하며 해당 구획만 도려내(클리핑) 보여준다.
// 사용자 도형(평면에서 그린 것)과 업로드한 GLB 모델이 함께 표시된다.
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Canvas } from "@react-three/fiber";
import Scene3D from "./three/Scene3D";
import { SECTIONS, type SectionKey } from "@/lib/three/coords";
import { LAYER_LABELS, layerOn, type PlanLayersConfig } from "@/lib/planLayers";
import type { ImportedModel } from "@/lib/models3d/registry";
import type { PlanShape } from "@/lib/shapes/types";
import type { Device, DeviceReading } from "@/lib/types";

type Props = {
  devices: Device[];
  readings: Record<string, DeviceReading>;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  shapes: PlanShape[];
  layers: PlanLayersConfig;
  onLayersChange: (patch: Partial<PlanLayersConfig>) => void;
};

export default function Deck3D({
  devices,
  readings,
  selectedId,
  onSelect,
  shapes,
  layers,
  onLayersChange,
}: Props) {
  const [sectionKey, setSectionKey] = useState<SectionKey>("overview");
  const section = SECTIONS.find((s) => s.key === sectionKey)!;

  // 임포트 모델
  const [models, setModels] = useState<ImportedModel[]>([]);
  const [panelOpen, setPanelOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadErr, setUploadErr] = useState<string | null>(null);
  const exportRef = useRef<(() => void) | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const loadModels = useCallback(async () => {
    const r = await fetch("/api/models");
    if (r.ok) setModels(await r.json());
  }, []);
  useEffect(() => {
    void loadModels();
  }, [loadModels]);

  const upload = async (file: File) => {
    setUploading(true);
    setUploadErr(null);
    const fd = new FormData();
    fd.append("file", file);
    fd.append("name", file.name.replace(/\.glb$/i, ""));
    const r = await fetch("/api/models", { method: "POST", body: fd });
    setUploading(false);
    if (!r.ok) {
      setUploadErr((await r.json().catch(() => ({}))).error ?? "업로드 실패");
      return;
    }
    await loadModels();
  };

  const patchModel = async (id: string, patch: Partial<ImportedModel>) => {
    setModels((arr) => arr.map((m) => (m.id === id ? { ...m, ...patch } : m)));
    await fetch("/api/models", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, ...patch }),
    });
    await loadModels();
  };

  const removeModel = async (id: string) => {
    await fetch(`/api/models?id=${encodeURIComponent(id)}`, { method: "DELETE" });
    await loadModels();
  };

  return (
    <div className="relative h-full w-full">
      <Canvas
        shadows
        dpr={[1, 1.5]}
        gl={{ localClippingEnabled: true, antialias: true, powerPreference: "high-performance" }}
        camera={{ position: [11, 7.5, 13], fov: 42 }}
        onPointerMissed={() => onSelect(null)}
      >
        <Scene3D
          section={section}
          devices={devices}
          readings={readings}
          selectedId={selectedId}
          onSelect={onSelect}
          shapes={shapes}
          layers={layers}
          models={models}
          exportRef={exportRef}
        />
      </Canvas>

      {/* 섹션 칩 */}
      <div className="absolute bottom-4 left-1/2 z-10 flex -translate-x-1/2 items-center gap-1 rounded-2xl bg-white/70 p-1.5 shadow-lg ring-1 ring-black/5 backdrop-blur-md">
        {SECTIONS.map((s) => (
          <button
            key={s.key}
            onClick={() => setSectionKey(s.key)}
            className={`rounded-xl px-3 py-2 text-sm font-medium transition-colors ${
              sectionKey === s.key ? "bg-sky-600 text-white" : "text-slate-600 hover:bg-slate-100"
            }`}
          >
            {s.label}
          </button>
        ))}
      </div>

      {/* 우측 하단: 레이어 + 모델/내보내기 */}
      <div className="absolute bottom-4 right-4 z-10 flex items-center gap-1 rounded-2xl bg-white/70 p-1.5 shadow-lg ring-1 ring-black/5 backdrop-blur-md">
        {LAYER_LABELS.three.map((e) => (
          <button
            key={e.key}
            onClick={() => onLayersChange({ three: { [e.key]: !layerOn(layers.three, e.key) } })}
            className={`rounded-xl px-2.5 py-1.5 text-xs font-medium transition-colors ${
              layerOn(layers.three, e.key)
                ? "bg-slate-200/80 text-slate-700"
                : "text-slate-400 line-through"
            }`}
          >
            {e.label}
          </button>
        ))}
        <div className="mx-0.5 h-5 w-px bg-slate-300/60" />
        <button
          onClick={() => setPanelOpen((v) => !v)}
          className={`rounded-xl px-2.5 py-1.5 text-xs font-semibold ${
            panelOpen ? "bg-sky-600 text-white" : "text-sky-700 hover:bg-sky-50"
          }`}
        >
          📦 모델 {models.length > 0 && `(${models.length})`}
        </button>
      </div>

      {/* 모델 패널 */}
      {panelOpen && (
        <div className="absolute bottom-16 right-4 z-20 w-80 rounded-2xl bg-white/95 p-4 shadow-xl ring-1 ring-black/5 backdrop-blur-md">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-700">GLB 모델</h3>
            <button onClick={() => setPanelOpen(false)} className="rounded p-1 text-slate-400 hover:bg-slate-100">✕</button>
          </div>

          {/* 내보내기 / 가져오기 */}
          <div className="mt-3 flex gap-2">
            <button
              onClick={() => exportRef.current?.()}
              className="flex-1 rounded-lg bg-slate-800 px-3 py-2 text-sm font-medium text-white hover:bg-slate-900"
            >
              ⬇ 씬 내보내기 (.glb)
            </button>
            <button
              onClick={() => fileRef.current?.click()}
              disabled={uploading}
              className="flex-1 rounded-lg bg-sky-600 px-3 py-2 text-sm font-medium text-white hover:bg-sky-700 disabled:opacity-60"
            >
              {uploading ? "업로드 중…" : "⬆ GLB 가져오기"}
            </button>
            <input
              ref={fileRef}
              type="file"
              accept=".glb"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void upload(f);
                e.target.value = "";
              }}
            />
          </div>
          {uploadErr && <p className="mt-2 text-xs text-red-600">{uploadErr}</p>}
          <p className="mt-2 text-[11px] leading-relaxed text-slate-400">
            내보낸 GLB는 블렌더에서 File→Import→glTF 2.0 으로 열어 이어서 작업할 수 있습니다.
            블렌더 결과물은 File→Export→glTF 2.0(.glb) 후 여기로 가져오세요.
          </p>

          {/* 모델 목록 */}
          <ul className="mt-3 max-h-64 space-y-2 overflow-y-auto">
            {models.map((m) => (
              <li key={m.id} className="rounded-lg border border-slate-200 p-2">
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={m.visible !== false}
                    onChange={(e) => patchModel(m.id, { visible: e.target.checked })}
                    className="h-4 w-4 accent-sky-600"
                  />
                  <span className="min-w-0 flex-1 truncate text-sm font-medium text-slate-700">{m.name}</span>
                  <button onClick={() => removeModel(m.id)} className="text-xs font-medium text-red-600 hover:underline">
                    삭제
                  </button>
                </div>
                <div className="mt-1.5 grid grid-cols-4 gap-1.5">
                  {(
                    [
                      ["X", "x", 0.1],
                      ["Y", "y", 0.1],
                      ["Z", "z", 0.1],
                      ["회전°", "rotYDeg", 15],
                    ] as const
                  ).map(([label, key, step]) => (
                    <label key={key} className="text-[10px] text-slate-400">
                      {label}
                      <input
                        type="number"
                        step={step}
                        value={m[key]}
                        onChange={(e) => patchModel(m.id, { [key]: Number(e.target.value) })}
                        className="mt-0.5 w-full rounded border border-slate-200 px-1 py-0.5 text-xs outline-none focus:border-sky-400"
                      />
                    </label>
                  ))}
                </div>
                <label className="mt-1 block text-[10px] text-slate-400">
                  스케일
                  <input
                    type="number"
                    step={0.1}
                    min={0.01}
                    value={m.scale}
                    onChange={(e) => Number(e.target.value) > 0 && patchModel(m.id, { scale: Number(e.target.value) })}
                    className="mt-0.5 w-full rounded border border-slate-200 px-1 py-0.5 text-xs outline-none focus:border-sky-400"
                  />
                </label>
              </li>
            ))}
            {models.length === 0 && (
              <li className="py-3 text-center text-xs text-slate-400">가져온 모델이 없습니다.</li>
            )}
          </ul>
        </div>
      )}

      {/* 조작 힌트 */}
      <div className="pointer-events-none absolute bottom-4 left-4 z-10 rounded-lg bg-white/60 px-3 py-1.5 text-xs text-slate-500 backdrop-blur">
        드래그 회전 · 휠 줌 — 가까이 들어가면 내부가 보입니다
      </div>
    </div>
  );
}
