// 사용자 도형 SVG 렌더 — 정규 좌표로 저장된 도형을 그리고, 선택/지우개 상호작용을 처리.
// 좌현(port) 뷰 미러는 부모(DeckPlan)가 그룹 transform 으로 처리한다.
"use client";

import type { PlanShape } from "@/lib/shapes/types";

export type ShapeOffset = { id: string; dx: number; dy: number } | null;

function shifted(s: PlanShape, off: ShapeOffset) {
  const dx = off && off.id === s.id ? off.dx : 0;
  const dy = off && off.id === s.id ? off.dy : 0;
  return { dx, dy };
}

export function shapeBBox(s: PlanShape): { x: number; y: number; w: number; h: number } {
  if (s.kind === "rect") return { x: s.x!, y: s.y!, w: s.w!, h: s.h! };
  if (s.kind === "ellipse")
    return { x: s.cx! - s.rx!, y: s.cy! - s.ry!, w: s.rx! * 2, h: s.ry! * 2 };
  const pts = s.points ?? [];
  const xs = pts.map((p) => p.x);
  const ys = pts.map((p) => p.y);
  const minX = Math.min(...xs), minY = Math.min(...ys);
  return { x: minX, y: minY, w: Math.max(...xs) - minX, h: Math.max(...ys) - minY };
}

export default function ShapesLayer({
  shapes,
  offset,
  selectedId,
  interactive,
  onPointerDownShape,
  onClickShape,
}: {
  shapes: PlanShape[];
  offset: ShapeOffset;
  selectedId: string | null;
  /** select/erase 도구일 때만 포인터 이벤트를 받는다 */
  interactive: boolean;
  onPointerDownShape?: (id: string, e: React.PointerEvent) => void;
  onClickShape?: (id: string, e: React.MouseEvent) => void;
}) {
  return (
    <g id="user-shapes" pointerEvents={interactive ? undefined : "none"}>
      {shapes.map((s) => {
        const { dx, dy } = shifted(s, offset);
        const st = s.style;
        const common = {
          stroke: st.stroke,
          strokeWidth: st.strokeWidth,
          fill: st.fill === "none" ? "none" : st.fill,
          fillOpacity: st.fill === "none" ? undefined : st.fillOpacity,
          strokeDasharray: st.dash ? "8 6" : undefined,
          className: interactive ? "cursor-pointer" : "",
          onPointerDown: onPointerDownShape
            ? (e: React.PointerEvent) => onPointerDownShape(s.id, e)
            : undefined,
          onClick: onClickShape ? (e: React.MouseEvent) => onClickShape(s.id, e) : undefined,
        };
        const selectedMark = selectedId === s.id && (
          <SelectionBox s={s} dx={dx} dy={dy} />
        );

        switch (s.kind) {
          case "rect":
            return (
              <g key={s.id}>
                <rect x={s.x! + dx} y={s.y! + dy} width={s.w} height={s.h} rx={4} {...common} />
                {selectedMark}
              </g>
            );
          case "ellipse":
            return (
              <g key={s.id}>
                <ellipse cx={s.cx! + dx} cy={s.cy! + dy} rx={s.rx} ry={s.ry} {...common} />
                {selectedMark}
              </g>
            );
          case "line": {
            const [a, b] = s.points ?? [];
            if (!a || !b) return null;
            return (
              <g key={s.id}>
                {/* 클릭 판정 넓힘 */}
                <line x1={a.x + dx} y1={a.y + dy} x2={b.x + dx} y2={b.y + dy} stroke="transparent" strokeWidth={14}
                  onPointerDown={common.onPointerDown} onClick={common.onClick}
                  className={common.className} />
                <line x1={a.x + dx} y1={a.y + dy} x2={b.x + dx} y2={b.y + dy}
                  stroke={st.stroke} strokeWidth={st.strokeWidth}
                  strokeDasharray={st.dash ? "8 6" : undefined} strokeLinecap="round" pointerEvents="none" />
                {selectedMark}
              </g>
            );
          }
          case "polygon": {
            const pts = (s.points ?? []).map((p) => `${p.x + dx},${p.y + dy}`).join(" ");
            return (
              <g key={s.id}>
                <polygon points={pts} {...common} strokeLinejoin="round" />
                {selectedMark}
              </g>
            );
          }
          case "path": {
            const pts = s.points ?? [];
            if (pts.length < 2) return null;
            const d = `M${pts.map((p) => `${p.x + dx},${p.y + dy}`).join(" L")}`;
            return (
              <g key={s.id}>
                <path d={d} stroke="transparent" strokeWidth={14} fill="none"
                  onPointerDown={common.onPointerDown} onClick={common.onClick}
                  className={common.className} />
                <path d={d} stroke={st.stroke} strokeWidth={st.strokeWidth} fill="none"
                  strokeDasharray={st.dash ? "8 6" : undefined}
                  strokeLinecap="round" strokeLinejoin="round" pointerEvents="none" />
                {selectedMark}
              </g>
            );
          }
        }
      })}
    </g>
  );
}

function SelectionBox({ s, dx, dy }: { s: PlanShape; dx: number; dy: number }) {
  const b = shapeBBox(s);
  return (
    <rect
      x={b.x + dx - 6}
      y={b.y + dy - 6}
      width={b.w + 12}
      height={b.h + 12}
      fill="none"
      stroke="#0ea5e9"
      strokeWidth={1.5}
      strokeDasharray="5 4"
      pointerEvents="none"
    />
  );
}
