// 디바이스 추가/편집 폼 (편집 모드에서 사용).
"use client";

import { useState } from "react";
import {
  CATEGORY_META,
  DEVICE_CATEGORIES,
  type Device,
  type DeviceCategory,
} from "@/lib/types";

export type DraftDevice = {
  id?: string;
  name: string;
  category: DeviceCategory;
  position: { x: number; y: number };
  sensorId?: string;
  notes?: string;
};

type Props = {
  initial: DraftDevice;
  onSave: (draft: DraftDevice) => void;
  onCancel: () => void;
};

export default function DevicePlacementForm({ initial, onSave, onCancel }: Props) {
  const [name, setName] = useState(initial.name);
  const [category, setCategory] = useState<DeviceCategory>(initial.category);
  const [sensorId, setSensorId] = useState(initial.sensorId ?? "");
  const [notes, setNotes] = useState(initial.notes ?? "");

  const isEdit = !!initial.id;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    onSave({
      ...initial,
      name: name.trim(),
      category,
      sensorId: sensorId.trim() || undefined,
      notes: notes.trim() || undefined,
    });
  };

  return (
    <div className="fixed inset-0 z-20 flex items-center justify-center bg-slate-900/40 p-4">
      <form
        onSubmit={submit}
        className="w-full max-w-md rounded-xl bg-white p-5 shadow-xl"
      >
        <h2 className="text-base font-semibold text-slate-800">
          {isEdit ? "부품 편집" : "부품 추가"}
        </h2>
        <p className="mt-0.5 text-xs text-slate-400">
          위치 ({initial.position.x}, {initial.position.y})
        </p>

        <label className="mt-4 block text-sm font-medium text-slate-700">
          이름
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="예: 청수 탱크 (전방)"
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-sky-500"
          />
        </label>

        <label className="mt-3 block text-sm font-medium text-slate-700">
          카테고리
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value as DeviceCategory)}
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-sky-500"
          >
            {DEVICE_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {CATEGORY_META[c].icon} {CATEGORY_META[c].label}
              </option>
            ))}
          </select>
        </label>

        <label className="mt-3 block text-sm font-medium text-slate-700">
          센서 ID <span className="font-normal text-slate-400">(선택 · CAN/zigbee 연결 키)</span>
          <input
            value={sensorId}
            onChange={(e) => setSensorId(e.target.value)}
            placeholder="예: water-fwd"
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-sky-500"
          />
        </label>

        <label className="mt-3 block text-sm font-medium text-slate-700">
          메모 <span className="font-normal text-slate-400">(선택)</span>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            className="mt-1 w-full resize-none rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-sky-500"
          />
        </label>

        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100"
          >
            취소
          </button>
          <button
            type="submit"
            className="rounded-lg bg-sky-600 px-4 py-2 text-sm font-medium text-white hover:bg-sky-700"
          >
            저장
          </button>
        </div>
      </form>
    </div>
  );
}
