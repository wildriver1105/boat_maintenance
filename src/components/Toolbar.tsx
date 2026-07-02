// 상단 툴바 — 경계선 없이 도면 위에 떠 있는 반투명 오버레이(키오스크 스타일).
"use client";

import type { ReactNode } from "react";
import type { DeckView } from "@/lib/types";

const VIEWS: { key: DeckView; label: string }[] = [
  { key: "top", label: "평면" },
  { key: "port", label: "좌현" },
  { key: "starboard", label: "우현" },
];

type Props = {
  view: DeckView;
  onViewChange: (v: DeckView) => void;
  editMode: boolean;
  onToggleEdit: () => void;
  showLabels: boolean;
  onToggleLabels: () => void;
  panelOpen: boolean;
  onTogglePanel: () => void;
  connected: boolean;
  source: string | null;
  deviceCount: number;
  right?: ReactNode;
};

export default function Toolbar({
  view,
  onViewChange,
  editMode,
  onToggleEdit,
  showLabels,
  onToggleLabels,
  panelOpen,
  onTogglePanel,
  connected,
  source,
  deviceCount,
  right,
}: Props) {
  return (
    <div className="pointer-events-none absolute inset-x-0 top-0 z-30 flex items-start justify-between gap-3 p-3">
      {/* 좌측: 타이틀 (도면 위에 떠 있음) */}
      <div className="pointer-events-auto flex items-center gap-3">
        <div className="rounded-2xl bg-white/70 px-4 py-2 shadow-lg ring-1 ring-black/5 backdrop-blur-md">
          <h1 className="text-base font-semibold text-slate-800">
            ⛵ Oceanis Clipper 473
          </h1>
          <p className="text-[11px] text-slate-500">
            부품 {deviceCount}개 · 2D 도면
          </p>
        </div>

        {/* 뷰 전환 (평면/좌현/우현) */}
        <div className="flex items-center gap-1 rounded-2xl bg-white/70 p-1.5 shadow-lg ring-1 ring-black/5 backdrop-blur-md">
          {VIEWS.map((v) => (
            <button
              key={v.key}
              onClick={() => onViewChange(v.key)}
              className={`rounded-xl px-3 py-2 text-sm font-medium transition-colors ${
                view === v.key
                  ? "bg-sky-600 text-white"
                  : "text-slate-600 hover:bg-slate-100"
              }`}
            >
              {v.label}
            </button>
          ))}
        </div>
      </div>

      {/* 우측: 컨트롤 그룹 */}
      <div className="pointer-events-auto flex items-center gap-1.5 rounded-2xl bg-white/70 p-1.5 shadow-lg ring-1 ring-black/5 backdrop-blur-md">
        <span className="inline-flex items-center gap-1.5 px-2 text-xs text-slate-500">
          <span
            className={`inline-block h-2 w-2 rounded-full ${connected ? "bg-emerald-500" : "bg-slate-300"}`}
          />
          {connected ? source ?? "" : "대기"}
        </span>

        <button
          onClick={onToggleLabels}
          className={`rounded-xl px-3 py-2 text-sm font-medium transition-colors ${
            showLabels
              ? "bg-sky-100 text-sky-700"
              : "text-slate-500 hover:bg-slate-100"
          }`}
        >
          라벨
        </button>

        <button
          onClick={onToggleEdit}
          className={`rounded-xl px-3 py-2 text-sm font-medium transition-colors ${
            editMode
              ? "bg-sky-600 text-white hover:bg-sky-700"
              : "text-slate-600 hover:bg-slate-100"
          }`}
        >
          {editMode ? "편집 종료" : "편집"}
        </button>

        <button
          onClick={onTogglePanel}
          aria-label="패널 열기/닫기"
          className={`rounded-xl px-3 py-2 text-sm font-medium transition-colors ${
            panelOpen
              ? "bg-slate-100 text-slate-700"
              : "text-slate-600 hover:bg-slate-100"
          }`}
        >
          패널 {panelOpen ? "›" : "‹"}
        </button>

        {right}
      </div>
    </div>
  );
}
