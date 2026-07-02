// 도면 컨테이너 — 뷰(평면/좌현/우현) 전환 + 라벨 오버레이 + 디바이스 마커 + (편집 모드) 클릭 배치.
// 세 뷰 모두 같은 viewBox(0 0 2000 850)를 공유: 평면은 device.position,
// 측면은 x=position.x(선수-선미 방향 공유) + y=sideY(수직 위치)를 사용한다.
"use client";

import { useMemo, useRef } from "react";
import DeckPlanSvg from "./DeckPlanSvg";
import DeckPlanSideSvg from "./DeckPlanSideSvg";
import DeviceMarker from "./DeviceMarker";
import { layoutLabels } from "@/lib/labelLayout";
import { summarize } from "@/lib/format";
import {
  CATEGORY_META,
  STATUS_META,
  type DeckView,
  type Device,
  type DeviceReading,
} from "@/lib/types";

const SIDE_DEFAULT_Y = 430; // sideY 미지정 시 측면 뷰 기본 높이

type Props = {
  devices: Device[];
  readings: Record<string, DeviceReading>;
  selectedId: string | null;
  view: Exclude<DeckView, "3d">; // 3D 는 Deck3D 가 담당
  editMode: boolean;
  showLabels: boolean;
  pending: { x: number; y: number } | null;
  onSelect: (id: string | null) => void;
  onPlace: (pos: { x: number; y: number }) => void;
};

export default function DeckPlan({
  devices,
  readings,
  selectedId,
  view,
  editMode,
  showLabels,
  pending,
  onSelect,
  onPlace,
}: Props) {
  const svgRef = useRef<SVGSVGElement>(null);

  // 좌현 뷰는 반대편에서 보므로 좌우 반전 (뱃머리 왼쪽)
  const mirror = view === "port";
  const flipX = (x: number) => (mirror ? 2000 - x : x);

  // 현재 뷰에서의 디바이스 표시 좌표 (측면은 x=종방향 공유+미러, y=sideY)
  const effectivePos = useMemo(() => {
    const map: Record<string, { x: number; y: number }> = {};
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

  // 화면 클릭 좌표 → SVG viewBox 좌표
  const toSvgCoords = (clientX: number, clientY: number) => {
    const svg = svgRef.current;
    if (!svg) return null;
    const pt = svg.createSVGPoint();
    pt.x = clientX;
    pt.y = clientY;
    const ctm = svg.getScreenCTM();
    if (!ctm) return null;
    const p = pt.matrixTransform(ctm.inverse());
    return { x: Math.round(p.x), y: Math.round(p.y) };
  };

  const handleBackgroundClick = (e: React.MouseEvent<SVGSVGElement>) => {
    if (editMode) {
      const pos = toSvgCoords(e.clientX, e.clientY);
      if (pos) onPlace({ x: flipX(pos.x), y: pos.y }); // 미러 뷰면 정규 좌표로 되돌려 저장
    } else {
      onSelect(null);
    }
  };

  return (
    <div className="relative h-full w-full">
      <svg
        ref={svgRef}
        viewBox="0 0 2000 850"
        className={`h-full w-full ${editMode ? "cursor-crosshair" : ""}`}
        onClick={handleBackgroundClick}
        role="img"
        aria-label={view === "top" ? "선박 평면 도면" : "선박 측면 도면"}
      >
        {view === "top" ? (
          <DeckPlanSvg />
        ) : (
          <DeckPlanSideSvg side={view} mirror={mirror} />
        )}

        {/* 라벨 + 리더 라인 (레퍼런스 스타일) */}
        {showLabels && (
          <g id="labels">
            {devices.map((d) => {
              const a = labels[d.id];
              const p = effectivePos[d.id];
              if (!a || !p) return null;
              const cat = CATEGORY_META[d.category];
              const r = d.sensorId ? readings[d.sensorId] : undefined;
              const status = d.sensorId ? r?.status ?? "offline" : "offline";
              const selected = selectedId === d.id;
              return (
                <g
                  key={d.id}
                  className="cursor-pointer"
                  onClick={(e) => {
                    e.stopPropagation();
                    onSelect(d.id);
                  }}
                >
                  <line
                    x1={p.x}
                    y1={p.y}
                    x2={a.x}
                    y2={a.y}
                    stroke={selected ? "#0ea5e9" : cat.accent}
                    strokeWidth={selected ? 2 : 1.2}
                    opacity={selected ? 1 : 0.65}
                  />
                  <circle cx={a.x} cy={a.y} r={3.5} fill={cat.accent} />
                  <text
                    x={a.x}
                    y={a.y > 425 ? a.y + 20 : a.y - 16}
                    textAnchor="middle"
                    fontSize={19}
                    fontWeight={600}
                    fill={selected ? "#0284c7" : "#1e293b"}
                    stroke="#ffffff"
                    strokeWidth={4}
                    paintOrder="stroke"
                    style={{ userSelect: "none" }}
                  >
                    {d.name}
                  </text>
                  <text
                    x={a.x}
                    y={a.y > 425 ? a.y + 40 : a.y + 4}
                    textAnchor="middle"
                    fontSize={15}
                    fill={STATUS_META[status].color}
                    stroke="#ffffff"
                    strokeWidth={3.5}
                    paintOrder="stroke"
                    style={{ userSelect: "none" }}
                  >
                    {summarize(d, r)}
                  </text>
                </g>
              );
            })}
          </g>
        )}

        <g id="devices">
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

        {/* 편집 모드에서 새 위치 미리보기 (미러 뷰면 표시 좌표로 반전) */}
        {editMode && pending && (
          <g transform={`translate(${flipX(pending.x)} ${pending.y})`} pointerEvents="none">
            <circle r={16} fill="rgba(14,165,233,0.2)" stroke="#0ea5e9" strokeWidth={3} strokeDasharray="4 4" />
            <text y={1} textAnchor="middle" dominantBaseline="central" fontSize={18} fill="#0ea5e9">
              +
            </text>
          </g>
        )}
      </svg>

      {editMode && (
        <div className="pointer-events-none absolute left-1/2 top-3 -translate-x-1/2 rounded-full bg-sky-600/90 px-4 py-1.5 text-sm font-medium text-white shadow">
          편집 모드 — 도면을 클릭해 부품을 배치하세요
          {view !== "top" && " (측면 위치로 저장됩니다)"}
        </div>
      )}
    </div>
  );
}
