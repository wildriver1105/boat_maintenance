// 편집 도구 툴바 — 장비 배치 / 선택·이동 / 그리기(사각형·원·선·자유곡선) / 지우개 / 레이어.
"use client";

import { useState } from "react";
import { LAYER_LABELS, layerOn, type PlanLayersConfig } from "@/lib/planLayers";
import type { DeckView } from "@/lib/types";

export type EditTool = "device" | "select" | "rect" | "ellipse" | "line" | "path" | "erase";

const TOOLS: { key: EditTool; icon: string; label: string }[] = [
  { key: "device", icon: "📍", label: "장비 배치" },
  { key: "select", icon: "🖐", label: "선택·이동" },
  { key: "rect", icon: "▭", label: "사각형" },
  { key: "ellipse", icon: "◯", label: "원" },
  { key: "line", icon: "∕", label: "선" },
  { key: "path", icon: "✏️", label: "자유곡선" },
  { key: "erase", icon: "🧹", label: "지우개" },
];

export default function EditToolbar({
  view,
  tool,
  onToolChange,
  layers,
  onLayersChange,
}: {
  view: DeckView;
  tool: EditTool;
  onToolChange: (t: EditTool) => void;
  layers: PlanLayersConfig;
  onLayersChange: (patch: Partial<PlanLayersConfig>) => void;
}) {
  const [layersOpen, setLayersOpen] = useState(false);
  const group: keyof PlanLayersConfig = view === "top" ? "top" : "side";
  const entries = LAYER_LABELS[group];

  return (
    <div className="absolute bottom-4 left-1/2 z-20 -translate-x-1/2">
      {/* 레이어 팝오버 */}
      {layersOpen && (
        <div className="mb-2 rounded-2xl bg-white/90 p-3 shadow-lg ring-1 ring-black/5 backdrop-blur-md">
          <div className="mb-1.5 text-xs font-semibold text-slate-500">
            내장 도면 레이어 (끄면 도면에서 지워집니다)
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-1.5">
            {entries.map((e) => (
              <label key={e.key} className="flex items-center gap-1.5 text-sm text-slate-700">
                <input
                  type="checkbox"
                  checked={layerOn(layers[group], e.key)}
                  onChange={(ev) =>
                    onLayersChange({ [group]: { [e.key]: ev.target.checked } } as Partial<PlanLayersConfig>)
                  }
                  className="h-4 w-4 accent-sky-600"
                />
                {e.label}
              </label>
            ))}
          </div>
        </div>
      )}

      <div className="flex items-center gap-1 rounded-2xl bg-white/85 p-1.5 shadow-lg ring-1 ring-black/5 backdrop-blur-md">
        {TOOLS.map((t) => (
          <button
            key={t.key}
            onClick={() => onToolChange(t.key)}
            title={t.label}
            className={`flex h-10 min-w-10 items-center justify-center gap-1 rounded-xl px-2.5 text-sm font-medium transition-colors ${
              tool === t.key ? "bg-sky-600 text-white" : "text-slate-600 hover:bg-slate-100"
            }`}
          >
            <span>{t.icon}</span>
            <span className="hidden lg:inline">{t.label}</span>
          </button>
        ))}
        <div className="mx-1 h-6 w-px bg-slate-200" />
        <button
          onClick={() => setLayersOpen((v) => !v)}
          className={`flex h-10 items-center gap-1 rounded-xl px-2.5 text-sm font-medium ${
            layersOpen ? "bg-slate-200 text-slate-800" : "text-slate-600 hover:bg-slate-100"
          }`}
        >
          🗂 <span className="hidden lg:inline">레이어</span>
        </button>
      </div>
    </div>
  );
}
