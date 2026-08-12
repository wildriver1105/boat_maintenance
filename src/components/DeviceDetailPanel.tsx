// 선택된 디바이스 상세 패널 — 카테고리별 수치 + 편집/삭제.
// 그룹(시스템) 디바이스는 하위 기기(생태계) 목록을 표시하고, 하위 기기는 상위 시스템 링크를 표시.
"use client";

import {
  CATEGORY_META,
  STATUS_META,
  type Device,
  type DeviceReading,
} from "@/lib/types";
import { useEffect, useState } from "react";
import { detailRows, summarize } from "@/lib/format";
import { childrenOf } from "@/lib/deviceGroups";
import { bindingOf } from "@/lib/victron/binding";

/**
 * 조명 디머 — config.lighting 장비 전용.
 * 현재 밝기는 SSE 리딩(values.duty)으로 들어오고, 조절은 /api/lighting PUT.
 * 슬라이더는 드래그 중 즉시 쏘지 않고 120ms 디바운스로 시리얼을 보호한다.
 */
function DimmerControl({ reading }: { reading?: DeviceReading }) {
  const live = typeof reading?.values.duty === "number" ? (reading.values.duty as number) : null;
  const connected = reading?.status === "ok";
  const [drag, setDrag] = useState<number | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const shown = drag ?? live ?? 0;

  // 외부(음성 등)에서 바뀐 값 반영 — 드래그 중이 아닐 때만
  useEffect(() => {
    if (drag == null) return;
    const t = setTimeout(async () => {
      try {
        const r = await fetch("/api/lighting", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ duty: drag }),
        });
        if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error ?? `HTTP ${r.status}`);
        setErr(null);
      } catch (e) {
        setErr((e as Error).message);
      }
      setDrag(null);
    }, 120);
    return () => clearTimeout(t);
  }, [drag]);

  const put = (duty: number) => setDrag(duty);

  return (
    <div className="mt-4 rounded-xl bg-white/70 p-3 ring-1 ring-black/5">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">밝기</span>
        <span className="text-sm font-semibold tabular-nums text-slate-800">
          {connected ? `${shown}%` : "미연결"}
        </span>
      </div>
      <input
        type="range"
        min={0}
        max={100}
        step={1}
        value={shown}
        disabled={!connected}
        onChange={(e) => put(Number(e.target.value))}
        className="mt-2 w-full accent-amber-500 disabled:opacity-40"
        aria-label="조명 밝기"
      />
      <div className="mt-2 flex gap-2">
        {[
          ["끄기", 0],
          ["은은하게", 20],
          ["보통", 60],
          ["최대", 100],
        ].map(([label, duty]) => (
          <button
            key={label as string}
            onClick={() => put(duty as number)}
            disabled={!connected}
            className="flex-1 rounded-lg border border-slate-200 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-40"
          >
            {label}
          </button>
        ))}
      </div>
      {!connected && (
        <p className="mt-2 text-[11px] text-slate-400">
          ESP32 디머가 응답하지 않습니다 — 조명 회로 전원과 USB 연결을 확인하세요.
        </p>
      )}
      {err && <p className="mt-2 text-[11px] text-red-500">{err}</p>}
    </div>
  );
}

type Props = {
  device: Device;
  reading?: DeviceReading;
  devices: Device[];
  readings: Record<string, DeviceReading>;
  onSelectDevice: (id: string) => void;
  onEdit: (d: Device) => void;
  onDelete: (id: string) => void;
  onToggleEnabled: (d: Device, enabled: boolean) => void;
  onClose: () => void;
};

export default function DeviceDetailPanel({
  device,
  reading,
  devices,
  readings,
  onSelectDevice,
  onEdit,
  onDelete,
  onToggleEnabled,
  onClose,
}: Props) {
  const cat = CATEGORY_META[device.category];
  const status = reading?.status ?? "offline";
  const children = childrenOf(devices, device.id);
  const parent = device.parentId
    ? devices.find((d) => d.id === device.parentId)
    : undefined;
  const isGroup = children.length > 0;
  const rows = isGroup ? [] : detailRows(device, reading);
  const victron = bindingOf(device);

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-start justify-between gap-2">
        <div>
          {parent && (
            <button
              onClick={() => onSelectDevice(parent.id)}
              className="mb-1 flex items-center gap-1 text-xs text-slate-400 hover:text-slate-600"
            >
              ‹ {parent.name}
            </button>
          )}
          <div className="flex items-center gap-2">
            <span className="text-xl">{cat.icon}</span>
            <h2 className="text-base font-semibold text-slate-800">{device.name}</h2>
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            <span
              className="inline-block rounded-full px-2 py-0.5 text-xs font-medium"
              style={{ background: `${cat.accent}1a`, color: cat.accent }}
            >
              {cat.label}
            </span>
            {reading?.source === "victron" ? (
              <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-600">
                실측 · Victron
              </span>
            ) : null}
          </div>
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
        {isGroup && <span className="text-xs font-normal opacity-70">· {summarize(device, reading)}</span>}
        {!isGroup && !device.sensorId && (
          <span className="text-xs font-normal opacity-70">· 센서 미연결</span>
        )}
      </div>

      {/* 조명 디머 (config.lighting 장비) */}
      {device.config?.lighting === true && <DimmerControl reading={reading} />}

      {/* 그룹: 구성 기기(생태계) 목록 */}
      {isGroup ? (
        <div className="mt-4 min-h-0 flex-1 overflow-y-auto">
          <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">
            구성 기기 {children.length}
          </h3>
          <ul className="space-y-0.5">
            {children.map((c) => {
              const r = c.sensorId ? readings[c.sensorId] : undefined;
              const s = r?.status ?? "offline";
              return (
                <li key={c.id}>
                  <button
                    onClick={() => onSelectDevice(c.id)}
                    className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left hover:bg-slate-100/70"
                  >
                    <span className="text-sm">{CATEGORY_META[c.category].icon}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm text-slate-700">{c.name}</span>
                      <span className="block truncate text-[11px] text-slate-400">
                        {summarize(c, r)}
                      </span>
                    </span>
                    <span
                      className="h-2 w-2 shrink-0 rounded-full"
                      style={{ background: STATUS_META[s].color }}
                    />
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      ) : (
        /* 단일 기기: 수치 */
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
      )}

      <div className="mt-4 space-y-1 text-xs text-slate-400">
        <div>ID: {device.id}</div>
        <div>센서: {device.sensorId ?? "—"}</div>
        {victron && (
          <div>
            Victron: {victron.path}
            {victron.gxName && ` · ${victron.gxName}`}
          </div>
        )}
        <div>위치: ({device.position.x}, {device.position.y})</div>
      </div>

      {device.enabled === false && (
        <div className="mt-4 rounded-lg bg-slate-50 p-3 text-xs text-slate-500 ring-1 ring-slate-200">
          데이터 소스가 없어 도면에서 감춰둔 장비입니다. 위치·메모는 그대로 보관 중이며,
          센서를 연결하면 다시 표시할 수 있습니다.
          <button
            onClick={() => onToggleEnabled(device, true)}
            className="mt-2 w-full rounded-lg bg-sky-600 py-1.5 text-xs font-medium text-white hover:bg-sky-700"
          >
            도면에 표시
          </button>
        </div>
      )}

      <div className="mt-auto flex gap-2 pt-4">
        <button
          onClick={() => onEdit(device)}
          className="flex-1 rounded-lg border border-slate-200 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          편집
        </button>
        {device.enabled !== false && (
          <button
            onClick={() => onToggleEnabled(device, false)}
            title="도면에서 감춤 (삭제 아님)"
            className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-500 hover:bg-slate-50"
          >
            감춤
          </button>
        )}
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
