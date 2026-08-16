// 상단 툴바 — 경계선 없이 도면 위에 떠 있는 반투명 오버레이(키오스크 스타일).
//
// 도면이 주인공이므로 툴바는 접힌다. 접으면 햄버거 버튼과 뷰 전환만 남고,
// 나머지 컨트롤은 사라진다 — 배에서는 대개 도면만 띄워 두고 보기 때문이다.
"use client";

import { useState, type ReactNode } from "react";
import type { DeckView } from "@/lib/types";

const VIEWS: { key: DeckView; label: string }[] = [
  { key: "top", label: "평면" },
  { key: "port", label: "좌현" },
  { key: "starboard", label: "우현" },
  { key: "3d", label: "3D" },
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
  onOpenElectrical: () => void;
  onOpenEngine: () => void;
  onOpenMetrics: () => void;
  onOpenNav: () => void;
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
  onOpenElectrical,
  onOpenEngine,
  onOpenMetrics,
  onOpenNav,
  right,
}: Props) {
  const [open, setOpen] = useState(true);

  return (
    <div className="pointer-events-none absolute inset-x-0 top-0 z-30 flex items-start justify-between gap-3 p-3">
      {/* 좌측: 뷰 전환 */}
      <div className="pointer-events-auto flex items-center gap-3">
        <div className="flex items-center gap-1 rounded-2xl bg-white/70 p-1.5 shadow-lg ring-1 ring-black/5 backdrop-blur-md">
          {VIEWS.map((v) => (
            <button
              key={v.key}
              onClick={() => onViewChange(v.key)}
              className={`rounded-xl px-3 py-2 text-sm font-medium transition-colors ${
                view === v.key ? "bg-sky-600 text-white" : "text-slate-600 hover:bg-slate-100"
              }`}
            >
              {v.label}
            </button>
          ))}
        </div>
      </div>

      {/* 우측: 컨트롤 그룹 + 햄버거 — 접으면 묶음만 사라지고 손잡이는 남는다 */}
      <div className="pointer-events-auto flex items-start gap-3">
        {open && (
        <div className="flex items-center gap-1.5 rounded-2xl bg-white/70 p-1.5 shadow-lg ring-1 ring-black/5 backdrop-blur-md">
          <button
            onClick={onOpenElectrical}
            className="rounded-xl px-3 py-2 text-sm font-medium text-amber-600 transition-colors hover:bg-amber-50"
          >
            ⚡ 전기
          </button>

          <button
            onClick={onOpenEngine}
            className="rounded-xl px-3 py-2 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-100"
          >
            ⚙️ 엔진
          </button>

          <button
            onClick={onOpenNav}
            className="rounded-xl px-3 py-2 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-100"
          >
            🧭 항해
          </button>

          <button
            onClick={onOpenMetrics}
            className="rounded-xl px-3 py-2 text-sm font-medium text-sky-600 transition-colors hover:bg-sky-50"
          >
            📈 추이
          </button>

          {view !== "3d" && (
            <>
              <button
                onClick={onToggleLabels}
                className={`rounded-xl px-3 py-2 text-sm font-medium transition-colors ${
                  showLabels ? "bg-sky-100 text-sky-700" : "text-slate-500 hover:bg-slate-100"
                }`}
              >
                라벨
              </button>

              <button
                onClick={onToggleEdit}
                className={`rounded-xl px-3 py-2 text-sm font-medium transition-colors ${
                  editMode ? "bg-sky-600 text-white hover:bg-sky-700" : "text-slate-600 hover:bg-slate-100"
                }`}
              >
                {editMode ? "편집 종료" : "편집"}
              </button>
            </>
          )}

          <button
            onClick={onTogglePanel}
            aria-label="패널 열기/닫기"
            className={`rounded-xl px-3 py-2 text-sm font-medium transition-colors ${
              panelOpen ? "bg-slate-100 text-slate-700" : "text-slate-600 hover:bg-slate-100"
            }`}
          >
            패널 {panelOpen ? "›" : "‹"}
          </button>

          {right}
        </div>
        )}

        <button
          onClick={() => setOpen((v) => !v)}
          aria-label={open ? "메뉴 접기" : "메뉴 펼치기"}
          aria-expanded={open}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-white/70 text-slate-600 shadow-lg ring-1 ring-black/5 backdrop-blur-md transition-colors hover:text-slate-800"
        >
          {/* 접힘 상태를 아이콘으로도 알린다 (햄버거 ↔ 닫기) */}
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden>
            {open ? (
              <path d="M4 4 L14 14 M14 4 L4 14" stroke="currentColor" strokeWidth={2} strokeLinecap="round" />
            ) : (
              <path d="M2.5 4.5h13M2.5 9h13M2.5 13.5h13" stroke="currentColor" strokeWidth={2} strokeLinecap="round" />
            )}
          </svg>
        </button>
      </div>
    </div>
  );
}
