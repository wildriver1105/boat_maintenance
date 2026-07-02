// 도면 위 디바이스 마커 — 상태 색상 + 카테고리 아이콘, 클릭/선택 처리.
"use client";

import { CATEGORY_META, STATUS_META, type Device, type DeviceReading } from "@/lib/types";
import { summarize } from "@/lib/format";

type Props = {
  device: Device;
  /** 현재 뷰에서의 표시 좌표 (평면=position, 측면=x+sideY) */
  pos: { x: number; y: number };
  reading?: DeviceReading;
  selected: boolean;
  onSelect: (id: string) => void;
};

export default function DeviceMarker({ device, pos, reading, selected, onSelect }: Props) {
  const cat = CATEGORY_META[device.category];
  const status = device.sensorId ? reading?.status ?? "offline" : "offline";
  const color = STATUS_META[status].color;
  const { x, y } = pos;
  const r = 17;

  return (
    <g
      transform={`translate(${x} ${y})`}
      className="cursor-pointer"
      onClick={(e) => {
        e.stopPropagation();
        onSelect(device.id);
      }}
    >
      <title>
        {device.name} — {STATUS_META[status].label} · {summarize(device, reading)}
      </title>

      {/* 경고/알람이면 맥동 링 */}
      {(status === "alert" || status === "warning") && (
        <circle r={r + 6} fill="none" stroke={color} strokeWidth={2} opacity={0.5}>
          <animate attributeName="r" values={`${r};${r + 12};${r}`} dur="1.6s" repeatCount="indefinite" />
          <animate attributeName="opacity" values="0.5;0;0.5" dur="1.6s" repeatCount="indefinite" />
        </circle>
      )}

      {/* 선택 링 */}
      {selected && <circle r={r + 5} fill="none" stroke="#0ea5e9" strokeWidth={3} />}

      <circle r={r} fill="#ffffff" stroke={color} strokeWidth={4} />
      <text
        y={1}
        textAnchor="middle"
        dominantBaseline="central"
        fontSize={16}
        style={{ userSelect: "none" }}
      >
        {cat.icon}
      </text>

      {/* 상태 점 */}
      <circle cx={r - 2} cy={-(r - 2)} r={5} fill={color} stroke="#fff" strokeWidth={1.5} />
    </g>
  );
}
