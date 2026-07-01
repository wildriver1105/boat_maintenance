// 선택된 디바이스 상세 패널 — 카테고리별 수치 + 편집/삭제.
"use client";

import {
  CATEGORY_META,
  STATUS_META,
  type Device,
  type DeviceReading,
} from "@/lib/types";
import { detailRows } from "@/lib/format";

type Props = {
  device: Device;
  reading?: DeviceReading;
  onEdit: (d: Device) => void;
  onDelete: (id: string) => void;
  onClose: () => void;
};

export default function DeviceDetailPanel({
  device,
  reading,
  onEdit,
  onDelete,
  onClose,
}: Props) {
  const cat = CATEGORY_META[device.category];
  const status = device.sensorId ? reading?.status ?? "offline" : "offline";
  const rows = detailRows(device, reading);

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xl">{cat.icon}</span>
            <h2 className="text-base font-semibold text-slate-800">{device.name}</h2>
          </div>
          <span
            className="mt-1 inline-block rounded-full px-2 py-0.5 text-xs font-medium"
            style={{ background: `${cat.accent}1a`, color: cat.accent }}
          >
            {cat.label}
          </span>
        </div>
        <button
          onClick={onClose}
          className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
          aria-label="닫기"
        >
          ✕
        </button>
      </div>

      {/* 상태 배지 */}
      <div
        className="mt-4 flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium"
        style={{ background: `${STATUS_META[status].color}18`, color: STATUS_META[status].color }}
      >
        <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: STATUS_META[status].color }} />
        {STATUS_META[status].label}
        {!device.sensorId && <span className="text-xs font-normal opacity-70">· 센서 미연결</span>}
      </div>

      {/* 수치 */}
      <dl className="mt-4 space-y-1.5">
        {rows.length === 0 && (
          <p className="text-sm text-slate-400">표시할 값이 없습니다.</p>
        )}
        {rows.map(([k, v]) => (
          <div key={k} className="flex justify-between border-b border-slate-100 pb-1.5 text-sm">
            <dt className="text-slate-500">{k}</dt>
            <dd className="font-medium text-slate-800">{v}</dd>
          </div>
        ))}
      </dl>

      <div className="mt-4 space-y-1 text-xs text-slate-400">
        <div>ID: {device.id}</div>
        <div>센서: {device.sensorId ?? "—"}</div>
        <div>위치: ({device.position.x}, {device.position.y})</div>
      </div>

      <div className="mt-auto flex gap-2 pt-4">
        <button
          onClick={() => onEdit(device)}
          className="flex-1 rounded-lg border border-slate-200 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          편집
        </button>
        <button
          onClick={() => onDelete(device.id)}
          className="rounded-lg border border-red-200 px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-50"
        >
          삭제
        </button>
      </div>
    </div>
  );
}
