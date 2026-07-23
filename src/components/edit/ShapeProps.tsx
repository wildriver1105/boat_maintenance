// 선택된 도형 속성 패널 — 이름/색/선굵기/채움 + (top 뷰) 3D 압출 파라미터.
"use client";

import { PALETTE, type PlanShape } from "@/lib/shapes/types";
import { distPx, fmtM, mToPx, pxToM } from "@/lib/units";

/** 미터 입력 필드 (px 로 저장) */
function MeterField({
  label,
  px,
  onPx,
}: {
  label: string;
  px: number;
  onPx: (px: number) => void;
}) {
  return (
    <label className="text-xs text-slate-500">
      {label}
      <input
        type="number"
        step={0.05}
        min={0.05}
        value={Number(pxToM(px).toFixed(2))}
        onChange={(e) => {
          const m = Number(e.target.value);
          if (m > 0) onPx(Math.round(mToPx(m)));
        }}
        className="mt-0.5 w-full rounded-lg border border-slate-300 px-2 py-1 text-sm outline-none focus:border-sky-500"
      />
    </label>
  );
}

export default function ShapeProps({
  shape,
  onChange,
  onDelete,
  onClose,
}: {
  shape: PlanShape;
  onChange: (patch: Partial<PlanShape>) => void;
  onDelete: () => void;
  onClose: () => void;
}) {
  const st = shape.style;
  return (
    <div className="absolute right-4 top-20 z-30 w-64 rounded-2xl bg-white/95 p-4 shadow-xl ring-1 ring-black/5 backdrop-blur-md">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-700">도형 속성</h3>
        <button onClick={onClose} className="rounded p-1 text-slate-400 hover:bg-slate-100">✕</button>
      </div>

      <input
        value={shape.name ?? ""}
        onChange={(e) => onChange({ name: e.target.value })}
        placeholder="이름 (예: 발전기)"
        className="mt-2 w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm outline-none focus:border-sky-500"
      />

      {/* 실측 크기 (m) */}
      <div className="mt-3 text-xs font-medium text-slate-500">실측 크기 (m)</div>
      {shape.kind === "rect" && (
        <div className="mt-1 grid grid-cols-2 gap-2">
          <MeterField label="가로" px={shape.w ?? 0} onPx={(w) => onChange({ w })} />
          <MeterField label="세로" px={shape.h ?? 0} onPx={(h) => onChange({ h })} />
        </div>
      )}
      {shape.kind === "ellipse" && (
        <div className="mt-1 grid grid-cols-2 gap-2">
          <MeterField label="가로 지름" px={(shape.rx ?? 0) * 2} onPx={(d) => onChange({ rx: Math.round(d / 2) })} />
          <MeterField label="세로 지름" px={(shape.ry ?? 0) * 2} onPx={(d) => onChange({ ry: Math.round(d / 2) })} />
        </div>
      )}
      {shape.kind === "line" && shape.points?.length === 2 && (
        <p className="mt-1 text-sm font-medium text-slate-700">
          길이 {fmtM(distPx(shape.points[0], shape.points[1]))}
        </p>
      )}
      {(shape.kind === "polygon" || shape.kind === "path") && (shape.points?.length ?? 0) > 1 && (() => {
        const xs = shape.points!.map((p) => p.x);
        const ys = shape.points!.map((p) => p.y);
        return (
          <p className="mt-1 text-sm text-slate-600">
            바운딩 {fmtM(Math.max(...xs) - Math.min(...xs))} × {fmtM(Math.max(...ys) - Math.min(...ys))}
          </p>
        );
      })()}

      {/* 선 색 */}
      <div className="mt-3 text-xs font-medium text-slate-500">선 색</div>
      <div className="mt-1 flex gap-1.5">
        {PALETTE.map((c) => (
          <button key={c} onClick={() => onChange({ style: { ...st, stroke: c } })}
            className={`h-6 w-6 rounded-full ${st.stroke === c ? "ring-2 ring-offset-1 ring-sky-500" : ""}`}
            style={{ background: c }} />
        ))}
      </div>

      {/* 채움 */}
      <div className="mt-3 text-xs font-medium text-slate-500">채움</div>
      <div className="mt-1 flex items-center gap-1.5">
        <button onClick={() => onChange({ style: { ...st, fill: "none" } })}
          className={`flex h-6 w-6 items-center justify-center rounded-full border border-slate-300 text-[10px] text-slate-400 ${st.fill === "none" ? "ring-2 ring-offset-1 ring-sky-500" : ""}`}>
          ∅
        </button>
        {PALETTE.map((c) => (
          <button key={c} onClick={() => onChange({ style: { ...st, fill: c } })}
            className={`h-6 w-6 rounded-full opacity-70 ${st.fill === c ? "ring-2 ring-offset-1 ring-sky-500" : ""}`}
            style={{ background: c }} />
        ))}
      </div>

      {/* 선 굵기 */}
      <div className="mt-3 flex items-center justify-between text-xs font-medium text-slate-500">
        선 굵기 <span className="text-slate-700">{st.strokeWidth}</span>
      </div>
      <input type="range" min={1} max={10} value={st.strokeWidth}
        onChange={(e) => onChange({ style: { ...st, strokeWidth: Number(e.target.value) } })}
        className="mt-1 w-full accent-sky-600" />

      <label className="mt-2 flex items-center gap-2 text-xs text-slate-600">
        <input type="checkbox" checked={!!st.dash}
          onChange={(e) => onChange({ style: { ...st, dash: e.target.checked } })}
          className="accent-sky-600" />
        점선
      </label>

      {/* 3D (top 뷰만) */}
      {shape.view === "top" && (
        <div className="mt-3 border-t border-slate-100 pt-3">
          <label className="flex items-center gap-2 text-xs font-medium text-slate-600">
            <input type="checkbox" checked={shape.show3d !== false}
              onChange={(e) => onChange({ show3d: e.target.checked })}
              className="accent-sky-600" />
            3D 뷰에 압출 표시
          </label>
          {shape.show3d !== false && (
            <div className="mt-2 grid grid-cols-2 gap-2">
              <label className="text-xs text-slate-500">
                높이 (m)
                <input type="number" step={0.1} value={shape.height3d ?? 0.5}
                  onChange={(e) => onChange({ height3d: Number(e.target.value) })}
                  className="mt-0.5 w-full rounded-lg border border-slate-300 px-2 py-1 text-sm outline-none focus:border-sky-500" />
              </label>
              <label className="text-xs text-slate-500">
                바닥고도 (m)
                <input type="number" step={0.1} value={shape.elevation3d ?? -0.3}
                  onChange={(e) => onChange({ elevation3d: Number(e.target.value) })}
                  className="mt-0.5 w-full rounded-lg border border-slate-300 px-2 py-1 text-sm outline-none focus:border-sky-500" />
              </label>
            </div>
          )}
          <p className="mt-1 text-[10px] text-slate-400">수선=0 · 솔≈-0.3 · 데크≈1.0</p>
        </div>
      )}

      <button onClick={onDelete}
        className="mt-4 w-full rounded-lg border border-red-200 py-1.5 text-sm font-medium text-red-600 hover:bg-red-50">
        도형 삭제
      </button>
    </div>
  );
}
