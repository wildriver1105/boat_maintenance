// 3D 뷰 컨테이너 — Canvas + 섹션 내비게이션 칩.
// 오버뷰에서는 줌 거리에 따라 외장↔내부가 자동 전환되고,
// 섹션 칩을 누르면 카메라가 이동하며 해당 구획만 도려내(클리핑) 보여준다.
"use client";

import { useState } from "react";
import { Canvas } from "@react-three/fiber";
import Scene3D from "./three/Scene3D";
import { SECTIONS, type SectionKey } from "@/lib/three/coords";
import type { Device, DeviceReading } from "@/lib/types";

type Props = {
  devices: Device[];
  readings: Record<string, DeviceReading>;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
};

export default function Deck3D({ devices, readings, selectedId, onSelect }: Props) {
  const [sectionKey, setSectionKey] = useState<SectionKey>("overview");
  const section = SECTIONS.find((s) => s.key === sectionKey)!;

  return (
    <div className="relative h-full w-full">
      <Canvas
        shadows
        dpr={[1, 1.5]}
        gl={{ localClippingEnabled: true, antialias: true, powerPreference: "high-performance" }}
        camera={{ position: [11, 7.5, 13], fov: 42 }}
        onPointerMissed={() => onSelect(null)}
      >
        <Scene3D
          section={section}
          devices={devices}
          readings={readings}
          selectedId={selectedId}
          onSelect={onSelect}
        />
      </Canvas>

      {/* 섹션 칩 */}
      <div className="absolute bottom-4 left-1/2 z-10 flex -translate-x-1/2 items-center gap-1 rounded-2xl bg-white/70 p-1.5 shadow-lg ring-1 ring-black/5 backdrop-blur-md">
        {SECTIONS.map((s) => (
          <button
            key={s.key}
            onClick={() => setSectionKey(s.key)}
            className={`rounded-xl px-3 py-2 text-sm font-medium transition-colors ${
              sectionKey === s.key
                ? "bg-sky-600 text-white"
                : "text-slate-600 hover:bg-slate-100"
            }`}
          >
            {s.label}
          </button>
        ))}
      </div>

      {/* 조작 힌트 */}
      <div className="pointer-events-none absolute bottom-4 left-4 z-10 rounded-lg bg-white/60 px-3 py-1.5 text-xs text-slate-500 backdrop-blur">
        드래그 회전 · 휠 줌 — 가까이 들어가면 내부가 보입니다
      </div>
    </div>
  );
}
