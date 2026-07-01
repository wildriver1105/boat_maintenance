// 상단 툴바 — 제목, 연결 상태, 편집 모드 토글.
"use client";

import type { ReactNode } from "react";

type Props = {
  editMode: boolean;
  onToggleEdit: () => void;
  showLabels: boolean;
  onToggleLabels: () => void;
  connected: boolean;
  source: string | null;
  deviceCount: number;
  right?: ReactNode;
};

export default function Toolbar({
  editMode,
  onToggleEdit,
  showLabels,
  onToggleLabels,
  connected,
  source,
  deviceCount,
  right,
}: Props) {
  return (
    <header className="flex items-center justify-between border-b border-slate-200 bg-white px-5 py-3">
      <div>
        <h1 className="text-lg font-semibold text-slate-800">
          ⛵ Oceanis Clipper 473 · 유지보수 디스플레이
        </h1>
        <p className="text-xs text-slate-400">
          부품 {deviceCount}개 · 평면 도면 (2D)
        </p>
      </div>

      <div className="flex items-center gap-4">
        <span className="inline-flex items-center gap-1.5 text-xs text-slate-500">
          <span
            className={`inline-block h-2 w-2 rounded-full ${connected ? "bg-emerald-500" : "bg-slate-300"}`}
          />
          {connected ? `연결됨 · ${source ?? ""}` : "연결 대기"}
        </span>

        <button
          onClick={onToggleLabels}
          className={`rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
            showLabels
              ? "border border-sky-300 bg-sky-50 text-sky-700"
              : "border border-slate-300 text-slate-500 hover:bg-slate-50"
          }`}
        >
          라벨 {showLabels ? "ON" : "OFF"}
        </button>

        <button
          onClick={onToggleEdit}
          className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
            editMode
              ? "bg-sky-600 text-white hover:bg-sky-700"
              : "border border-slate-300 text-slate-700 hover:bg-slate-50"
          }`}
        >
          {editMode ? "편집 종료" : "편집 모드"}
        </button>

        {right}
      </div>
    </header>
  );
}
