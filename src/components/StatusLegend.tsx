// 상태 색상 범례.
"use client";

import { STATUS_META, type DeviceStatus } from "@/lib/types";

const ORDER: DeviceStatus[] = ["ok", "warning", "alert", "offline"];

export default function StatusLegend() {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500">
      {ORDER.map((s) => (
        <span key={s} className="inline-flex items-center gap-1.5">
          <span
            className="inline-block h-2.5 w-2.5 rounded-full"
            style={{ background: STATUS_META[s].color }}
          />
          {STATUS_META[s].label}
        </span>
      ))}
    </div>
  );
}
