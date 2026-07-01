// 대시보드 — 상태를 소유하고 도면/패널/폼을 연결한다.
"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import Toolbar from "./Toolbar";
import DeckPlan from "./DeckPlan";
import StatusLegend from "./StatusLegend";
import DeviceDetailPanel from "./DeviceDetailPanel";
import DevicePlacementForm, { type DraftDevice } from "./DevicePlacementForm";
import {
  CATEGORY_META,
  STATUS_META,
  type Device,
  type DeviceReading,
} from "@/lib/types";
import { summarize } from "@/lib/format";

export default function Dashboard({ rightSlot }: { rightSlot?: ReactNode }) {
  const [devices, setDevices] = useState<Device[]>([]);
  const [readings, setReadings] = useState<Record<string, DeviceReading>>({});
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editMode, setEditMode] = useState(false);
  const [showLabels, setShowLabels] = useState(true);
  const [pending, setPending] = useState<{ x: number; y: number } | null>(null);
  const [draft, setDraft] = useState<DraftDevice | null>(null);
  const [connected, setConnected] = useState(false);
  const [source, setSource] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const res = await fetch("/api/devices");
    setDevices(await res.json());
  }, []);

  // 초기 디바이스 로드
  useEffect(() => {
    void refresh();
  }, [refresh]);

  // 텔레메트리 SSE 구독
  useEffect(() => {
    const es = new EventSource("/api/telemetry");
    es.addEventListener("hello", (e) => {
      const data = JSON.parse((e as MessageEvent).data);
      setConnected(true);
      setSource(data.source);
    });
    es.addEventListener("telemetry", (e) => {
      const data = JSON.parse((e as MessageEvent).data) as {
        readings: DeviceReading[];
      };
      setReadings((prev) => {
        const next = { ...prev };
        for (const r of data.readings) next[r.sensorId] = r;
        return next;
      });
    });
    es.onerror = () => setConnected(false);
    return () => es.close();
  }, []);

  const selected = devices.find((d) => d.id === selectedId) ?? null;

  const handlePlace = (pos: { x: number; y: number }) => {
    setPending(pos);
    setDraft({ name: "", category: "other", position: pos });
  };

  const handleSave = async (d: DraftDevice) => {
    if (d.id) {
      await fetch("/api/devices", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(d),
      });
    } else {
      await fetch("/api/devices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(d),
      });
    }
    setDraft(null);
    setPending(null);
    await refresh();
  };

  const handleDelete = async (id: string) => {
    await fetch(`/api/devices?id=${encodeURIComponent(id)}`, { method: "DELETE" });
    if (selectedId === id) setSelectedId(null);
    await refresh();
  };

  const handleEdit = (d: Device) => {
    setEditMode(true);
    setDraft({
      id: d.id,
      name: d.name,
      category: d.category,
      position: d.position,
      sensorId: d.sensorId,
      notes: d.notes,
    });
  };

  // 상태별 집계 (요약 배지)
  const summary = useMemo(() => {
    const counts = { ok: 0, warning: 0, alert: 0, offline: 0 };
    for (const d of devices) {
      const s = d.sensorId ? readings[d.sensorId]?.status ?? "offline" : "offline";
      counts[s]++;
    }
    return counts;
  }, [devices, readings]);

  return (
    <div className="flex h-screen flex-col bg-slate-50">
      <Toolbar
        editMode={editMode}
        onToggleEdit={() => {
          setEditMode((v) => !v);
          setPending(null);
        }}
        showLabels={showLabels}
        onToggleLabels={() => setShowLabels((v) => !v)}
        connected={connected}
        source={source}
        deviceCount={devices.length}
        right={rightSlot}
      />

      <div className="flex min-h-0 flex-1">
        {/* 도면 */}
        <main className="min-w-0 flex-1 p-4">
          <div className="h-full rounded-xl border border-slate-200 bg-white p-2 shadow-sm">
            <DeckPlan
              devices={devices}
              readings={readings}
              selectedId={selectedId}
              editMode={editMode}
              showLabels={showLabels}
              pending={pending}
              onSelect={setSelectedId}
              onPlace={handlePlace}
            />
          </div>
        </main>

        {/* 우측 패널 */}
        <aside className="flex w-80 shrink-0 flex-col gap-3 overflow-y-auto border-l border-slate-200 bg-white p-4">
          {/* 상태 집계 */}
          <div className="grid grid-cols-4 gap-2">
            {(["ok", "warning", "alert", "offline"] as const).map((s) => (
              <div
                key={s}
                className="rounded-lg border border-slate-100 py-2 text-center"
              >
                <div className="text-lg font-semibold" style={{ color: STATUS_META[s].color }}>
                  {summary[s]}
                </div>
                <div className="text-[10px] text-slate-400">{STATUS_META[s].label}</div>
              </div>
            ))}
          </div>
          <StatusLegend />

          <div className="mt-1 flex-1 border-t border-slate-100 pt-3">
            {selected ? (
              <DeviceDetailPanel
                device={selected}
                reading={selected.sensorId ? readings[selected.sensorId] : undefined}
                onEdit={handleEdit}
                onDelete={handleDelete}
                onClose={() => setSelectedId(null)}
              />
            ) : (
              <ul className="space-y-1">
                {devices.map((d) => {
                  const r = d.sensorId ? readings[d.sensorId] : undefined;
                  const status = d.sensorId ? r?.status ?? "offline" : "offline";
                  return (
                    <li key={d.id}>
                      <button
                        onClick={() => setSelectedId(d.id)}
                        className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left hover:bg-slate-50"
                      >
                        <span className="text-base">{CATEGORY_META[d.category].icon}</span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium text-slate-700">
                            {d.name}
                          </span>
                          <span className="block truncate text-xs text-slate-400">
                            {summarize(d, r)}
                          </span>
                        </span>
                        <span
                          className="h-2.5 w-2.5 shrink-0 rounded-full"
                          style={{ background: STATUS_META[status].color }}
                        />
                      </button>
                    </li>
                  );
                })}
                {devices.length === 0 && (
                  <p className="px-2 py-6 text-center text-sm text-slate-400">
                    부품이 없습니다. 편집 모드에서 도면을 클릭해 추가하세요.
                  </p>
                )}
              </ul>
            )}
          </div>
        </aside>
      </div>

      {draft && (
        <DevicePlacementForm
          initial={draft}
          onSave={handleSave}
          onCancel={() => {
            setDraft(null);
            setPending(null);
          }}
        />
      )}
    </div>
  );
}
