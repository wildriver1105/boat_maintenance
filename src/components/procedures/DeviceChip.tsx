// 체크 항목에 연결된 장비의 실시간 상태 칩.
"use client";

import { CATEGORY_META, STATUS_META, type Device, type DeviceReading } from "@/lib/types";
import { summarize } from "@/lib/format";

export default function DeviceChip({
  device,
  reading,
}: {
  device?: Device;
  reading?: DeviceReading;
}) {
  if (!device) return null;
  const status = device.sensorId ? reading?.status ?? "offline" : "offline";
  const color = STATUS_META[status].color;
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium"
      style={{ background: `${color}18`, color }}
      title={`${device.name} · ${STATUS_META[status].label}`}
    >
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: color }} />
      {CATEGORY_META[device.category].icon} {summarize(device, reading)}
    </span>
  );
}
