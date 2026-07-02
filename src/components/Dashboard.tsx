// 대시보드 — 상태를 소유하고 도면/패널/폼을 연결한다.
"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import dynamic from "next/dynamic";
import Toolbar from "./Toolbar";
import DeckPlan from "./DeckPlan";

// three.js 는 클라이언트 전용 — SSR 제외
const Deck3D = dynamic(() => import("./Deck3D"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full w-full items-center justify-center text-sm text-slate-400">
      3D 모델 로딩 중…
    </div>
  ),
});
import StatusLegend from "./StatusLegend";
import DeviceDetailPanel from "./DeviceDetailPanel";
import DevicePlacementForm, { type DraftDevice } from "./DevicePlacementForm";
import {
  CATEGORY_META,
  STATUS_META,
  type DeckView,
  type Device,
  type DeviceReading,
} from "@/lib/types";
import { summarize } from "@/lib/format";

export default function Dashboard({ rightSlot }: { rightSlot?: ReactNode }) {
  const [devices, setDevices] = useState<Device[]>([]);
  const [readings, setReadings] = useState<Record<string, DeviceReading>>({});
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [view, setView] = useState<DeckView>("top");
  const [editMode, setEditMode] = useState(false);
  const [showLabels, setShowLabels] = useState(true);
  const [panelOpen, setPanelOpen] = useState(true);
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

  // 마커 선택 시 패널을 자동으로 펼친다
  const handleSelect = (id: string | null) => {
    setSelectedId(id);
    if (id) setPanelOpen(true);
  };

  const handlePlace = (pos: { x: number; y: number }) => {
    setPending(pos);
    if (view === "top") {
      setDraft({ name: "", category: "other", position: pos });
    } else {
      // 측면 뷰: x 는 선수-선미 위치로 공유, 클릭한 y 는 sideY(수직 위치)로 저장
      setDraft({
        name: "",
        category: "other",
        position: { x: pos.x, y: 425 },
        sideY: pos.y,
      });
    }
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
      sideY: d.sideY,
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
    <div className="relative h-screen w-screen overflow-hidden bg-slate-100">
      {/* 화면 전체를 덮는 도면 (배경) */}
      <div className="absolute inset-0">
        {view === "3d" ? (
          <Deck3D
            devices={devices}
            readings={readings}
            selectedId={selectedId}
            onSelect={handleSelect}
          />
        ) : (
          <DeckPlan
            devices={devices}
            readings={readings}
            selectedId={selectedId}
            view={view}
            editMode={editMode}
            showLabels={showLabels}
            pending={pending}
            onSelect={handleSelect}
            onPlace={handlePlace}
          />
        )}
      </div>

      {/* 떠 있는 헤더 */}
      <Toolbar
        view={view}
        onViewChange={(v) => {
          setView(v);
          setPending(null);
          if (v === "3d") setEditMode(false); // 3D 에서는 배치 편집 없음 (2D 에서 배치)
        }}
        editMode={editMode}
        onToggleEdit={() => {
          setEditMode((v) => !v);
          setPending(null);
        }}
        showLabels={showLabels}
        onToggleLabels={() => setShowLabels((v) => !v)}
        panelOpen={panelOpen}
        onTogglePanel={() => setPanelOpen((v) => !v)}
        connected={connected}
        source={source}
        deviceCount={devices.length}
        right={rightSlot}
      />

      {/* 우측 패널 (접이식 오버레이) */}
      <aside
        className={`absolute right-0 top-0 z-20 flex h-full w-80 flex-col bg-white/85 shadow-2xl ring-1 ring-black/5 backdrop-blur-md transition-transform duration-300 ${
          panelOpen ? "translate-x-0" : "translate-x-full"
        }`}
      >
        {/* 접기 핸들 (패널 왼쪽 가장자리) */}
        <button
          onClick={() => setPanelOpen(false)}
          aria-label="패널 접기"
          className="absolute -left-8 top-1/2 flex h-16 w-8 -translate-y-1/2 items-center justify-center rounded-l-xl bg-white/85 text-slate-500 shadow-lg ring-1 ring-black/5 backdrop-blur-md hover:text-slate-700"
        >
          ›
        </button>

        <div className="flex flex-1 flex-col gap-3 overflow-y-auto p-4 pt-20">
          {/* 상태 집계 */}
          <div className="grid grid-cols-4 gap-2">
            {(["ok", "warning", "alert", "offline"] as const).map((s) => (
              <div
                key={s}
                className="rounded-lg bg-white/70 py-2 text-center ring-1 ring-black/5"
              >
                <div className="text-lg font-semibold" style={{ color: STATUS_META[s].color }}>
                  {summary[s]}
                </div>
                <div className="text-[10px] text-slate-400">{STATUS_META[s].label}</div>
              </div>
            ))}
          </div>
          <StatusLegend />

          <div className="mt-1 flex-1 border-t border-slate-200/70 pt-3">
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
                        onClick={() => handleSelect(d.id)}
                        className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left hover:bg-slate-100/70"
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
        </div>
      </aside>

      {/* 펼치기 핸들 (패널이 닫혔을 때) — 우측 가장자리 세로 중앙, 헤더와 겹치지 않음 */}
      {!panelOpen && (
        <button
          onClick={() => setPanelOpen(true)}
          aria-label="패널 펼치기"
          className="absolute right-0 top-1/2 z-20 flex h-16 w-8 -translate-y-1/2 items-center justify-center rounded-l-xl bg-white/85 text-slate-500 shadow-lg ring-1 ring-black/5 backdrop-blur-md hover:text-slate-700"
        >
          ‹
        </button>
      )}

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
