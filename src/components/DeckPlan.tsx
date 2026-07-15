// 도면 컨테이너 — 뷰(평면/좌현/우현) 전환 + 라벨 오버레이 + 디바이스 마커
// + 편집 모드: 장비 배치 / 도형 그리기(사각형·원·선·자유곡선) / 선택·이동 / 지우개 / 레이어.
// 세 뷰 모두 같은 viewBox(0 0 2000 850)를 공유. 좌현 뷰는 미러(뱃머리 왼쪽) —
// 도형/디바이스 좌표는 항상 "정규 좌표"로 저장하고 표시할 때만 반전한다.
"use client";

import { useMemo, useRef, useState } from "react";
import DeckPlanSvg from "./DeckPlanSvg";
import DeckPlanSideSvg from "./DeckPlanSideSvg";
import DeviceMarker from "./DeviceMarker";
import ShapesLayer, { type ShapeOffset } from "./edit/ShapesLayer";
import type { EditTool } from "./edit/EditToolbar";
import { layoutLabels } from "@/lib/labelLayout";
import { summarize } from "@/lib/format";
import { layerOn, type PlanLayersConfig } from "@/lib/planLayers";
import type { PlanShape, ShapeStyle } from "@/lib/shapes/types";

/** 생성 페이로드 — style 생략 시 서버 기본값 적용 */
export type ShapeDraft = Omit<PlanShape, "id" | "style"> & { style?: Partial<ShapeStyle> };
import {
  CATEGORY_META,
  STATUS_META,
  type DeckView,
  type Device,
  type DeviceReading,
} from "@/lib/types";

const SIDE_DEFAULT_Y = 430;

type Pt = { x: number; y: number };

type Props = {
  devices: Device[];
  readings: Record<string, DeviceReading>;
  selectedId: string | null;
  view: Exclude<DeckView, "3d">;
  editMode: boolean;
  editTool: EditTool;
  showLabels: boolean;
  pending: Pt | null;
  shapes: PlanShape[];
  selectedShapeId: string | null;
  layers: PlanLayersConfig;
  onSelect: (id: string | null) => void;
  onPlace: (pos: Pt) => void;
  onShapeCreate: (shape: ShapeDraft) => void;
  onShapeMove: (id: string, patch: Partial<PlanShape>) => void;
  onShapeDelete: (id: string) => void;
  onShapeSelect: (id: string | null) => void;
};

/** 이동(드래그) 시 도형 geometry 를 delta 만큼 옮긴 patch 생성 */
function offsetPatch(s: PlanShape, dx: number, dy: number): Partial<PlanShape> {
  if (s.kind === "rect") return { x: s.x! + dx, y: s.y! + dy };
  if (s.kind === "ellipse") return { cx: s.cx! + dx, cy: s.cy! + dy };
  return { points: (s.points ?? []).map((p) => ({ x: p.x + dx, y: p.y + dy })) };
}

export default function DeckPlan({
  devices,
  readings,
  selectedId,
  view,
  editMode,
  editTool,
  showLabels,
  pending,
  shapes,
  selectedShapeId,
  layers,
  onSelect,
  onPlace,
  onShapeCreate,
  onShapeMove,
  onShapeDelete,
  onShapeSelect,
}: Props) {
  const svgRef = useRef<SVGSVGElement>(null);

  // 좌현 뷰는 반대편에서 보므로 좌우 반전 (뱃머리 왼쪽)
  const mirror = view === "port";
  const flipX = (x: number) => (mirror ? 2000 - x : x);

  // 그리기 진행 상태
  const [draft, setDraft] = useState<{ start: Pt; cur: Pt } | null>(null);
  const [pathPts, setPathPts] = useState<Pt[]>([]);
  const [drag, setDrag] = useState<{ id: string; last: Pt } | null>(null);
  const [dragOff, setDragOff] = useState<ShapeOffset>(null);

  const drawingTool = ["rect", "ellipse", "line", "path"].includes(editTool);
  const viewShapes = useMemo(() => shapes.filter((s) => s.view === view), [shapes, view]);

  // 현재 뷰에서의 디바이스 표시 좌표
  const effectivePos = useMemo(() => {
    const map: Record<string, Pt> = {};
    for (const d of devices) {
      map[d.id] =
        view === "top"
          ? d.position
          : { x: flipX(d.position.x), y: d.sideY ?? SIDE_DEFAULT_Y };
    }
    return map;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [devices, view]);

  const labels = useMemo(
    () =>
      layoutLabels(
        devices.map((d) => ({
          id: d.id,
          ...effectivePos[d.id],
          labelOffset: view === "top" ? d.labelOffset : undefined,
        })),
      ),
    [devices, effectivePos, view],
  );

  // 화면 클릭 좌표 → SVG viewBox 정규 좌표
  const toCanonical = (clientX: number, clientY: number): Pt | null => {
    const svg = svgRef.current;
    if (!svg) return null;
    const pt = svg.createSVGPoint();
    pt.x = clientX;
    pt.y = clientY;
    const ctm = svg.getScreenCTM();
    if (!ctm) return null;
    const p = pt.matrixTransform(ctm.inverse());
    return { x: Math.round(flipX(p.x)), y: Math.round(p.y) };
  };

  /* ---------- 포인터 핸들러 (그리기/이동) ---------- */

  const handlePointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
    if (!editMode || !drawingTool) return;
    const p = toCanonical(e.clientX, e.clientY);
    if (!p) return;
    if (editTool === "path") setPathPts([p]);
    else setDraft({ start: p, cur: p });
  };

  const handlePointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    if (!editMode) return;
    const p = toCanonical(e.clientX, e.clientY);
    if (!p) return;
    if (drag) {
      setDragOff({ id: drag.id, dx: p.x - drag.last.x, dy: p.y - drag.last.y });
      return;
    }
    if (editTool === "path" && pathPts.length) {
      const last = pathPts[pathPts.length - 1];
      if (Math.hypot(p.x - last.x, p.y - last.y) > 6) setPathPts((a) => [...a, p]);
      return;
    }
    if (draft) setDraft({ ...draft, cur: p });
  };

  const handlePointerUp = () => {
    if (!editMode) return;
    // 도형 이동 확정
    if (drag && dragOff && (dragOff.dx !== 0 || dragOff.dy !== 0)) {
      const s = shapes.find((x) => x.id === drag.id);
      if (s) onShapeMove(s.id, offsetPatch(s, dragOff.dx, dragOff.dy));
    }
    setDrag(null);
    setDragOff(null);

    // 그리기 확정
    if (draft) {
      const { start, cur } = draft;
      const w = Math.abs(cur.x - start.x);
      const h = Math.abs(cur.y - start.y);
      if (editTool === "rect" && w > 8 && h > 8) {
        onShapeCreate({
          view, kind: "rect",
          x: Math.min(start.x, cur.x), y: Math.min(start.y, cur.y), w, h,

        });
      } else if (editTool === "ellipse" && (w > 8 || h > 8)) {
        onShapeCreate({
          view, kind: "ellipse",
          cx: start.x, cy: start.y, rx: Math.max(8, w), ry: Math.max(8, h),

        });
      } else if (editTool === "line" && Math.hypot(w, h) > 10) {
        onShapeCreate({ view, kind: "line", points: [start, cur]});
      }
      setDraft(null);
    }
    if (editTool === "path" && pathPts.length > 2) {
      onShapeCreate({ view, kind: "path", points: pathPts});
    }
    setPathPts([]);
  };

  const handleBackgroundClick = (e: React.MouseEvent<SVGSVGElement>) => {
    if (editMode) {
      if (editTool === "device") {
        const pos = toCanonical(e.clientX, e.clientY);
        if (pos) onPlace(pos);
      } else if (editTool === "select") {
        onShapeSelect(null);
      }
    } else {
      onSelect(null);
    }
  };

  const shapePointerDown = (id: string, e: React.PointerEvent) => {
    if (editTool !== "select") return;
    e.stopPropagation();
    const p = toCanonical(e.clientX, e.clientY);
    if (!p) return;
    onShapeSelect(id);
    setDrag({ id, last: p });
  };

  const shapeClick = (id: string, e: React.MouseEvent) => {
    if (editTool === "erase") {
      e.stopPropagation();
      onShapeDelete(id);
    } else if (editTool === "select") {
      e.stopPropagation();
    }
  };

  const cursor = !editMode
    ? ""
    : drawingTool
      ? "cursor-crosshair"
      : editTool === "device"
        ? "cursor-crosshair"
        : editTool === "erase"
          ? "cursor-not-allowed"
          : "";

  const layerCfg = view === "top" ? layers.top : layers.side;

  return (
    <div className="relative h-full w-full">
      <svg
        ref={svgRef}
        viewBox="0 0 2000 850"
        className={`h-full w-full ${cursor}`}
        onClick={handleBackgroundClick}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerUp}
        role="img"
        aria-label={view === "top" ? "선박 평면 도면" : "선박 측면 도면"}
      >
        {view === "top" ? (
          <DeckPlanSvg layers={layerCfg} />
        ) : (
          <DeckPlanSideSvg side={view} mirror={mirror} layers={layerCfg} />
        )}

        {/* 사용자 도형 (정규 좌표 → 미러 시 그룹 반전) */}
        <g transform={mirror ? "translate(2000,0) scale(-1,1)" : undefined}>
          <ShapesLayer
            shapes={viewShapes}
            offset={dragOff}
            selectedId={selectedShapeId}
            interactive={editMode && (editTool === "select" || editTool === "erase")}
            onPointerDownShape={shapePointerDown}
            onClickShape={shapeClick}
          />

          {/* 그리기 미리보기 */}
          {draft && editTool === "rect" && (
            <rect
              x={Math.min(draft.start.x, draft.cur.x)} y={Math.min(draft.start.y, draft.cur.y)}
              width={Math.abs(draft.cur.x - draft.start.x)} height={Math.abs(draft.cur.y - draft.start.y)}
              fill="rgba(14,165,233,0.12)" stroke="#0ea5e9" strokeWidth={2} strokeDasharray="6 4" pointerEvents="none" />
          )}
          {draft && editTool === "ellipse" && (
            <ellipse cx={draft.start.x} cy={draft.start.y}
              rx={Math.abs(draft.cur.x - draft.start.x)} ry={Math.abs(draft.cur.y - draft.start.y)}
              fill="rgba(14,165,233,0.12)" stroke="#0ea5e9" strokeWidth={2} strokeDasharray="6 4" pointerEvents="none" />
          )}
          {draft && editTool === "line" && (
            <line x1={draft.start.x} y1={draft.start.y} x2={draft.cur.x} y2={draft.cur.y}
              stroke="#0ea5e9" strokeWidth={3} strokeDasharray="6 4" pointerEvents="none" />
          )}
          {pathPts.length > 1 && (
            <path d={`M${pathPts.map((p) => `${p.x},${p.y}`).join(" L")}`}
              stroke="#0ea5e9" strokeWidth={3} fill="none" strokeDasharray="6 4" pointerEvents="none" />
          )}
        </g>

        {/* 라벨 + 리더 라인 (편집 중에는 클릭 통과) */}
        {showLabels && (
          <g id="labels" pointerEvents={editMode ? "none" : undefined}>
            {devices.map((d) => {
              const a = labels[d.id];
              const p = effectivePos[d.id];
              if (!a || !p) return null;
              const cat = CATEGORY_META[d.category];
              const r = d.sensorId ? readings[d.sensorId] : undefined;
              const status = d.sensorId ? r?.status ?? "offline" : "offline";
              const selected = selectedId === d.id;
              return (
                <g key={d.id} className="cursor-pointer"
                  onClick={(e) => { e.stopPropagation(); onSelect(d.id); }}>
                  <line x1={p.x} y1={p.y} x2={a.x} y2={a.y}
                    stroke={selected ? "#0ea5e9" : cat.accent}
                    strokeWidth={selected ? 2 : 1.2} opacity={selected ? 1 : 0.65} />
                  <circle cx={a.x} cy={a.y} r={3.5} fill={cat.accent} />
                  <text x={a.x} y={a.y > 425 ? a.y + 20 : a.y - 16} textAnchor="middle"
                    fontSize={19} fontWeight={600} fill={selected ? "#0284c7" : "#1e293b"}
                    stroke="#ffffff" strokeWidth={4} paintOrder="stroke" style={{ userSelect: "none" }}>
                    {d.name}
                  </text>
                  <text x={a.x} y={a.y > 425 ? a.y + 40 : a.y + 4} textAnchor="middle"
                    fontSize={15} fill={STATUS_META[status].color}
                    stroke="#ffffff" strokeWidth={3.5} paintOrder="stroke" style={{ userSelect: "none" }}>
                    {summarize(d, r)}
                  </text>
                </g>
              );
            })}
          </g>
        )}

        <g id="devices" pointerEvents={editMode && editTool !== "device" ? "none" : undefined}>
          {devices.map((d) => (
            <DeviceMarker
              key={d.id}
              device={d}
              pos={effectivePos[d.id]}
              reading={d.sensorId ? readings[d.sensorId] : undefined}
              selected={selectedId === d.id}
              onSelect={onSelect}
            />
          ))}
        </g>

        {/* 편집 모드에서 새 장비 위치 미리보기 */}
        {editMode && editTool === "device" && pending && (
          <g transform={`translate(${flipX(pending.x)} ${pending.y})`} pointerEvents="none">
            <circle r={16} fill="rgba(14,165,233,0.2)" stroke="#0ea5e9" strokeWidth={3} strokeDasharray="4 4" />
            <text y={1} textAnchor="middle" dominantBaseline="central" fontSize={18} fill="#0ea5e9">+</text>
          </g>
        )}
      </svg>

      {editMode && (
        <div className="pointer-events-none absolute left-1/2 top-3 -translate-x-1/2 rounded-full bg-sky-600/90 px-4 py-1.5 text-sm font-medium text-white shadow">
          {editTool === "device" && `장비 배치 — 도면을 클릭하세요${view !== "top" ? " (측면 위치로 저장)" : ""}`}
          {editTool === "select" && "선택·이동 — 도형을 클릭/드래그, 속성 패널에서 편집"}
          {editTool === "rect" && "사각형 — 드래그해서 그리기"}
          {editTool === "ellipse" && "원 — 중심에서 드래그"}
          {editTool === "line" && "선 — 드래그해서 그리기"}
          {editTool === "path" && "자유곡선 — 누른 채로 그리기"}
          {editTool === "erase" && "지우개 — 도형을 클릭해 삭제"}
        </div>
      )}
    </div>
  );
}
