// 도면 컨테이너 — SVG + 라벨 오버레이 + 디바이스 마커 + (편집 모드) 클릭 배치.
"use client";

import { useMemo, useRef } from "react";
import DeckPlanSvg from "./DeckPlanSvg";
import DeviceMarker from "./DeviceMarker";
import { layoutLabels } from "@/lib/labelLayout";
import { summarize } from "@/lib/format";
import {
  CATEGORY_META,
  STATUS_META,
  type Device,
  type DeviceReading,
} from "@/lib/types";

type Props = {
  devices: Device[];
  readings: Record<string, DeviceReading>;
  selectedId: string | null;
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
  editMode,
  showLabels,
  pending,
  onSelect,
  onPlace,
}: Props) {
  const svgRef = useRef<SVGSVGElement>(null);
  const labels = useMemo(() => layoutLabels(devices), [devices]);

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
      if (pos) onPlace(pos);
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
        aria-label="선박 평면 도면"
      >
        <DeckPlanSvg />

        {/* 라벨 + 리더 라인 (레퍼런스 스타일) */}
        {showLabels && (
          <g id="labels">
            {devices.map((d) => {
              const a = labels[d.id];
              if (!a) return null;
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
                    x1={d.position.x}
                    y1={d.position.y}
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
              reading={d.sensorId ? readings[d.sensorId] : undefined}
              selected={selectedId === d.id}
              onSelect={onSelect}
            />
          ))}
        </g>

        {/* 편집 모드에서 새 위치 미리보기 */}
        {editMode && pending && (
          <g transform={`translate(${pending.x} ${pending.y})`} pointerEvents="none">
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
        </div>
      )}
    </div>
  );
}
