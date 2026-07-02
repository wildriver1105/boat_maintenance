// 3D 씬 — Oceanis Clipper 473.
// 선체는 단면(station) 로프트로 생성하고, 내부 가구는 2D 도면 좌표를 toWorld 로 매핑해 배치.
// - 줌인(또는 내부 섹션 선택) → 데크/외장 페이드아웃으로 내부 공개
// - 섹션 선택 → 카메라 트윈 + 종방향 클리핑 평면으로 해당 구획만 도려냄(돌하우스 컷)
"use client";

import * as THREE from "three";
import { useEffect, useMemo, useRef, useState } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { Html, OrbitControls, RoundedBox } from "@react-three/drei";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import { toWorld, type Section } from "@/lib/three/coords";
import { CATEGORY_META, STATUS_META, type Device, type DeviceReading } from "@/lib/types";
import { summarize } from "@/lib/format";

/* ---------------- 선체/데크 지오메트리 (단면 로프트) ---------------- */

const STATIONS = [
  { x: -8.45, hb: 1.55, sheer: 1.02, bottom: -0.3 }, // 트랜섬
  { x: -7.0, hb: 2.05, sheer: 0.97, bottom: -0.55 },
  { x: -5.0, hb: 2.26, sheer: 0.93, bottom: -0.72 },
  { x: -3.0, hb: 2.34, sheer: 0.9, bottom: -0.8 },
  { x: -1.0, hb: 2.33, sheer: 0.9, bottom: -0.82 },
  { x: 1.0, hb: 2.22, sheer: 0.92, bottom: -0.8 },
  { x: 3.0, hb: 1.98, sheer: 0.96, bottom: -0.72 },
  { x: 5.0, hb: 1.58, sheer: 1.01, bottom: -0.6 },
  { x: 7.0, hb: 1.0, sheer: 1.09, bottom: -0.44 },
  { x: 8.3, hb: 0.4, sheer: 1.18, bottom: -0.22 },
  { x: 9.0, hb: 0.05, sheer: 1.25, bottom: 0.05 }, // 선수 스템
];

function buildLoft(kind: "hull" | "deck"): THREE.BufferGeometry {
  const C = 29;
  const verts: number[] = [];
  for (const st of STATIONS) {
    for (let i = 0; i < C; i++) {
      const u = i / (C - 1);
      if (kind === "hull") {
        const z = -st.hb * Math.cos(u * Math.PI);
        const y = st.sheer + (st.bottom - st.sheer) * Math.pow(Math.sin(u * Math.PI), 0.85);
        verts.push(st.x, y, z);
      } else {
        // 데크: 셰어라인 위 캠버(가운데가 살짝 볼록)
        const z = -st.hb * 0.985 * Math.cos(u * Math.PI);
        const y = st.sheer + 0.02 + 0.12 * (1 - Math.pow(2 * u - 1, 2));
        verts.push(st.x, y, z);
      }
    }
  }
  const idx: number[] = [];
  const R = STATIONS.length;
  for (let r = 0; r < R - 1; r++)
    for (let c = 0; c < C - 1; c++) {
      const a = r * C + c;
      const b = a + 1;
      const d = (r + 1) * C + c;
      idx.push(a, d, b, b, d, d + 1);
    }
  if (kind === "hull") {
    // 트랜섬 캡
    const st0 = STATIONS[0];
    const base = verts.length / 3;
    verts.push(st0.x, (st0.sheer + st0.bottom) / 2, 0);
    for (let c = 0; c < C - 1; c++) idx.push(base, c, c + 1);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(verts, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/* ---------------- 소품 ---------------- */

/** 두 점을 잇는 얇은 봉(리깅/레일용) */
function Rod({
  from,
  to,
  r = 0.018,
  color = "#8b98a8",
}: {
  from: [number, number, number];
  to: [number, number, number];
  r?: number;
  color?: string;
}) {
  const { pos, quat, len } = useMemo(() => {
    const a = new THREE.Vector3(...from);
    const b = new THREE.Vector3(...to);
    const dir = b.clone().sub(a);
    const len = dir.length();
    const quat = new THREE.Quaternion().setFromUnitVectors(
      new THREE.Vector3(0, 1, 0),
      dir.normalize(),
    );
    return { pos: a.add(b).multiplyScalar(0.5), quat, len };
  }, [from, to]);
  return (
    <mesh position={pos} quaternion={quat}>
      <cylinderGeometry args={[r, r, len, 6]} />
      <meshStandardMaterial color={color} transparent />
    </mesh>
  );
}

const FURN = { color: "#eef2f7", roughness: 0.9 };
const WHITE = { color: "#ffffff", roughness: 0.85 };
const WOOD = { color: "#d9c6a5", roughness: 0.75 };

/* ---------------- 내부 (가구) ---------------- */

function Interior() {
  return (
    <group>
      {/* 캐빈 솔 */}
      {[
        [-6.3, 3.9, 2.95],
        [-2.65, 3.5, 3.35],
        [0.65, 3.3, 3.2],
        [4.6, 4.6, 2.6],
        [7.5, 1.2, 1.4],
      ].map(([x, w, d], i) => (
        <mesh key={i} position={[x, -0.31, 0]} receiveShadow>
          <boxGeometry args={[w, 0.05, d]} />
          <meshStandardMaterial {...WOOD} />
        </mesh>
      ))}

      {/* 격벽 (중앙 통로만 남긴 세그먼트) */}
      {[
        [-4.4, -1.22],
        [-4.4, 1.22],
        [2.3, -1.2],
        [2.3, 1.2],
      ].map(([x, z], i) => (
        <mesh key={i} position={[x, 0.45, z]} castShadow>
          <boxGeometry args={[0.08, 1.5, 1.6]} />
          <meshStandardMaterial {...FURN} />
        </mesh>
      ))}
      <mesh position={[7.9, 0.3, 0]}>
        <boxGeometry args={[0.06, 1.0, 1.3]} />
        <meshStandardMaterial {...FURN} />
      </mesh>

      {/* 후방 좌현: 더블 베드 + 베개 */}
      <RoundedBox args={[3.2, 0.35, 1.35]} radius={0.06} position={[-6.3, -0.1, -1.35]} castShadow>
        <meshStandardMaterial {...WHITE} />
      </RoundedBox>
      <RoundedBox args={[0.5, 0.13, 0.55]} radius={0.05} position={[-7.55, 0.12, -1.62]}>
        <meshStandardMaterial color="#f8fafc" />
      </RoundedBox>
      <RoundedBox args={[0.5, 0.13, 0.55]} radius={0.05} position={[-7.55, 0.12, -1.02]}>
        <meshStandardMaterial color="#f8fafc" />
      </RoundedBox>

      {/* 후방 우현: 수납(세일백) */}
      <RoundedBox args={[0.8, 0.42, 0.8]} radius={0.16} position={[-6.4, -0.1, 1.15]}>
        <meshStandardMaterial color="#e2e8f0" roughness={1} />
      </RoundedBox>
      <RoundedBox args={[0.65, 0.36, 0.65]} radius={0.14} position={[-5.65, -0.12, 1.5]}>
        <meshStandardMaterial color="#e2e8f0" roughness={1} />
      </RoundedBox>

      {/* 후방 헤드(좌현): 화장대 + 변기 */}
      <mesh position={[-2.5, -0.03, -1.7]} castShadow>
        <boxGeometry args={[0.85, 0.55, 0.72]} />
        <meshStandardMaterial {...FURN} />
      </mesh>
      <mesh position={[-3.2, -0.13, -1.62]} castShadow>
        <cylinderGeometry args={[0.17, 0.14, 0.36, 16]} />
        <meshStandardMaterial {...WHITE} />
      </mesh>

      {/* 갤리(우현): 카운터 + 스토브 + 싱크 */}
      <mesh position={[-2.7, 0, 1.6]} castShadow>
        <boxGeometry args={[3.2, 0.6, 0.8]} />
        <meshStandardMaterial {...FURN} />
      </mesh>
      <mesh position={[-3.25, 0.34, 1.5]}>
        <boxGeometry args={[0.85, 0.09, 0.62]} />
        <meshStandardMaterial color="#475569" roughness={0.5} metalness={0.4} />
      </mesh>
      <mesh position={[-1.8, 0.33, 1.55]}>
        <boxGeometry args={[0.75, 0.07, 0.55]} />
        <meshStandardMaterial color="#cbd5e1" roughness={0.3} metalness={0.6} />
      </mesh>

      {/* 컴패니언웨이 계단 + 엔진 */}
      {[0, 1, 2].map((i) => (
        <mesh key={i} position={[-3.55 - i * 0.3, -0.08 + i * 0.28, 0]} castShadow>
          <boxGeometry args={[0.34, 0.1, 0.95]} />
          <meshStandardMaterial {...WOOD} />
        </mesh>
      ))}
      <mesh position={[-1.85, -0.36, 0]} castShadow>
        <boxGeometry args={[1.4, 0.52, 0.95]} />
        <meshStandardMaterial color="#64748b" roughness={0.55} metalness={0.35} />
      </mesh>

      {/* 살롱: 테이블 + 세틀리 */}
      <mesh position={[0.7, 0.18, -0.12]} castShadow>
        <boxGeometry args={[1.75, 0.06, 0.78]} />
        <meshStandardMaterial {...WOOD} />
      </mesh>
      <mesh position={[0.7, -0.08, -0.12]}>
        <boxGeometry args={[0.14, 0.46, 0.14]} />
        <meshStandardMaterial {...WOOD} />
      </mesh>
      <RoundedBox args={[2.7, 0.4, 0.65]} radius={0.07} position={[0.65, -0.1, -1.55]} castShadow>
        <meshStandardMaterial {...WHITE} />
      </RoundedBox>
      <RoundedBox args={[2.7, 0.5, 0.2]} radius={0.06} position={[0.65, 0.22, -1.9]}>
        <meshStandardMaterial {...WHITE} />
      </RoundedBox>
      <RoundedBox args={[2.3, 0.4, 0.6]} radius={0.07} position={[0.55, -0.1, 1.5]} castShadow>
        <meshStandardMaterial {...WHITE} />
      </RoundedBox>
      <RoundedBox args={[2.3, 0.5, 0.2]} radius={0.06} position={[0.55, 0.22, 1.83]}>
        <meshStandardMaterial {...WHITE} />
      </RoundedBox>

      {/* 항해석(차트 테이블) + 전방 헤드 */}
      <mesh position={[3.3, 0, 0.7]} castShadow>
        <boxGeometry args={[1.4, 0.5, 0.7]} />
        <meshStandardMaterial {...FURN} />
      </mesh>
      <mesh position={[2.9, -0.05, 1.5]}>
        <boxGeometry args={[0.6, 0.5, 0.55]} />
        <meshStandardMaterial {...FURN} />
      </mesh>
      <mesh position={[2.4, -0.13, 1.5]} castShadow>
        <cylinderGeometry args={[0.16, 0.13, 0.34, 16]} />
        <meshStandardMaterial {...WHITE} />
      </mesh>

      {/* 오너 선실: 아일랜드 베드 + 베개 + 사이드 벤치 */}
      <RoundedBox args={[3.4, 0.4, 2.1]} radius={0.1} position={[4.85, -0.1, 0]} castShadow>
        <meshStandardMaterial {...WHITE} />
      </RoundedBox>
      <RoundedBox args={[0.55, 0.14, 0.7]} radius={0.05} position={[6.25, 0.15, -0.5]}>
        <meshStandardMaterial color="#f8fafc" />
      </RoundedBox>
      <RoundedBox args={[0.55, 0.14, 0.7]} radius={0.05} position={[6.25, 0.15, 0.5]}>
        <meshStandardMaterial color="#f8fafc" />
      </RoundedBox>
      <mesh position={[3.35, -0.05, -1.5]}>
        <boxGeometry args={[1.1, 0.5, 0.5]} />
        <meshStandardMaterial {...FURN} />
      </mesh>
    </group>
  );
}

/* ---------------- 외장 (데크/코치루프/콕핏/리깅) ---------------- */

function Exterior() {
  const deckGeo = useMemo(() => buildLoft("deck"), []);
  const roofGeo = useMemo(() => {
    const s = new THREE.Shape();
    s.moveTo(-5.0, 1.72);
    s.lineTo(3.6, 1.12);
    s.quadraticCurveTo(5.6, 0.55, 5.9, 0);
    s.quadraticCurveTo(5.6, -0.55, 3.6, -1.12);
    s.lineTo(-5.0, -1.72);
    s.quadraticCurveTo(-5.35, 0, -5.0, 1.72);
    return new THREE.ExtrudeGeometry(s, {
      depth: 0.34,
      bevelEnabled: true,
      bevelThickness: 0.06,
      bevelSize: 0.1,
      bevelSegments: 3,
    });
  }, []);

  const MAST_X = 1.9;
  const MAST_TOP = 10.9;

  return (
    <group>
      {/* 데크 (티크) */}
      <mesh geometry={deckGeo} castShadow receiveShadow>
        <meshStandardMaterial color="#d8c8a4" roughness={0.85} side={THREE.DoubleSide} transparent />
      </mesh>

      {/* 코치루프 */}
      <mesh geometry={roofGeo} rotation-x={-Math.PI / 2} position={[0, 1.0, 0]} castShadow>
        <meshStandardMaterial color="#f4f6f9" roughness={0.4} transparent />
      </mesh>
      {/* 트렁크 측면 윈도우 */}
      {[-3.1, -1.1, 0.9].map((x, i) =>
        [1, -1].map((s) => (
          <mesh key={`${i}-${s}`} position={[x, 1.22, s * (1.52 - i * 0.11)]} rotation-y={s * 0.07}>
            <boxGeometry args={[1.5, 0.17, 0.05]} />
            <meshStandardMaterial color="#334155" roughness={0.15} metalness={0.3} transparent />
          </mesh>
        )),
      )}

      {/* 콕핏: 코밍 + 벤치 + 휠 */}
      <mesh position={[-5.3, 1.2, -1.05]} castShadow>
        <boxGeometry args={[3.0, 0.3, 0.15]} />
        <meshStandardMaterial color="#f4f6f9" transparent />
      </mesh>
      <mesh position={[-5.3, 1.2, 1.05]} castShadow>
        <boxGeometry args={[3.0, 0.3, 0.15]} />
        <meshStandardMaterial color="#f4f6f9" transparent />
      </mesh>
      <mesh position={[-3.85, 1.2, 0]}>
        <boxGeometry args={[0.15, 0.3, 2.2]} />
        <meshStandardMaterial color="#f4f6f9" transparent />
      </mesh>
      <mesh position={[-5.3, 1.1, -0.75]}>
        <boxGeometry args={[2.6, 0.1, 0.5]} />
        <meshStandardMaterial {...WOOD} transparent />
      </mesh>
      <mesh position={[-5.3, 1.1, 0.75]}>
        <boxGeometry args={[2.6, 0.1, 0.5]} />
        <meshStandardMaterial {...WOOD} transparent />
      </mesh>
      {/* 휠 + 페데스탈 */}
      <mesh position={[-6.35, 1.68, 0]} rotation-y={Math.PI / 2} castShadow>
        <torusGeometry args={[0.5, 0.035, 10, 40]} />
        <meshStandardMaterial color="#475569" roughness={0.4} transparent />
      </mesh>
      <mesh position={[-6.35, 1.3, 0]}>
        <cylinderGeometry args={[0.06, 0.09, 0.6, 10]} />
        <meshStandardMaterial color="#94a3b8" transparent />
      </mesh>

      {/* 마스트/붐/스테이 */}
      <mesh position={[MAST_X, (1.32 + MAST_TOP) / 2, 0]} castShadow>
        <cylinderGeometry args={[0.07, 0.1, MAST_TOP - 1.32, 10]} />
        <meshStandardMaterial color="#e2e8f0" roughness={0.35} metalness={0.5} transparent />
      </mesh>
      <mesh position={[MAST_X - 2.25, 2.35, 0]} rotation-z={Math.PI / 2}>
        <cylinderGeometry args={[0.06, 0.06, 4.5, 8]} />
        <meshStandardMaterial color="#e2e8f0" roughness={0.35} metalness={0.5} transparent />
      </mesh>
      <Rod from={[MAST_X, MAST_TOP, 0]} to={[8.85, 1.35, 0]} />
      <Rod from={[MAST_X, MAST_TOP, 0]} to={[-8.3, 1.15, 0]} />
      <Rod from={[MAST_X, MAST_TOP - 0.3, 0]} to={[MAST_X, 1.1, -2.15]} />
      <Rod from={[MAST_X, MAST_TOP - 0.3, 0]} to={[MAST_X, 1.1, 2.15]} />

      {/* 펄핏/푸시핏 */}
      <Rod from={[8.75, 1.75, 0]} to={[7.6, 1.75, -0.6]} r={0.022} />
      <Rod from={[8.75, 1.75, 0]} to={[7.6, 1.75, 0.6]} r={0.022} />
      <Rod from={[8.75, 1.3, 0]} to={[8.75, 1.75, 0]} r={0.022} />
      <Rod from={[-8.35, 1.05, -1.2]} to={[-8.35, 1.62, -1.2]} r={0.022} />
      <Rod from={[-8.35, 1.05, 1.2]} to={[-8.35, 1.62, 1.2]} r={0.022} />
      <Rod from={[-8.35, 1.62, -1.2]} to={[-8.35, 1.62, 1.2]} r={0.022} />
    </group>
  );
}

/* ---------------- 디바이스 마커 ---------------- */

function DeviceMarkers({
  devices,
  readings,
  selectedId,
  onSelect,
  section,
}: {
  devices: Device[];
  readings: Record<string, DeviceReading>;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  section: Section;
}) {
  return (
    <>
      {devices.map((d) => {
        const [x, y, z] = toWorld(d);
        const r = d.sensorId ? readings[d.sensorId] : undefined;
        const status = d.sensorId ? r?.status ?? "offline" : "offline";
        const color = STATUS_META[status].color;
        const selected = selectedId === d.id;
        // 섹션 진입 시 범위 밖 장비는 흐리게 (클리핑된 선체와 시각적으로 일치)
        const dimmed =
          !!section.range && (x < section.range[0] || x > section.range[1]);
        return (
          <Html key={d.id} position={[x, y, z]} center distanceFactor={11} zIndexRange={[15, 0]}>
            <div
              className="flex flex-col items-center transition-opacity"
              style={{
                opacity: dimmed ? 0.12 : 1,
                pointerEvents: dimmed ? "none" : "auto",
              }}
            >
              <button
                title={`${d.name} — ${summarize(d, r)}`}
                onClick={(e) => {
                  e.stopPropagation();
                  onSelect(d.id);
                }}
                className="flex h-10 w-10 items-center justify-center rounded-full bg-white text-base shadow-md transition-transform hover:scale-110"
                style={{
                  boxShadow: `0 0 0 3px ${color}${selected ? ", 0 0 0 6px #0ea5e9" : ""}, 0 2px 6px rgba(0,0,0,0.25)`,
                }}
              >
                {CATEGORY_META[d.category].icon}
              </button>
              {selected && (
                <div className="mt-1.5 whitespace-nowrap rounded-full bg-slate-800/90 px-2.5 py-1 text-xs font-medium text-white shadow">
                  {d.name} · <span style={{ color }}>{summarize(d, r)}</span>
                </div>
              )}
            </div>
          </Html>
        );
      })}
    </>
  );
}

/* ---------------- 카메라 리그 + 페이드 + 클리핑 ---------------- */

function Rig({
  section,
  extGroup,
  hullMat,
  boatGroup,
}: {
  section: Section;
  extGroup: React.RefObject<THREE.Group | null>;
  hullMat: React.RefObject<THREE.MeshStandardMaterial | null>;
  boatGroup: React.RefObject<THREE.Group | null>;
}) {
  const controlsRef = useRef<OrbitControlsImpl | null>(null);
  const { camera } = useThree();
  const extMats = useRef<THREE.Material[]>([]);
  const tween = useRef({ active: false });
  const interiorRef = useRef(false);

  // 외장 머티리얼 수집 (1회)
  useEffect(() => {
    const mats: THREE.Material[] = [];
    extGroup.current?.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) {
        const m = (o as THREE.Mesh).material;
        for (const mat of Array.isArray(m) ? m : [m]) {
          mat.transparent = true;
          mats.push(mat);
        }
      }
    });
    extMats.current = mats;
  }, [extGroup]);

  // 섹션 변경 → 카메라 트윈 시작 + 클리핑 평면 적용
  useEffect(() => {
    tween.current.active = true;
    const planes = section.range
      ? [
          new THREE.Plane(new THREE.Vector3(1, 0, 0), -section.range[0]),
          new THREE.Plane(new THREE.Vector3(-1, 0, 0), section.range[1]),
        ]
      : null;
    boatGroup.current?.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) {
        const m = (o as THREE.Mesh).material;
        for (const mat of Array.isArray(m) ? m : [m]) {
          mat.clippingPlanes = planes;
          mat.clipShadows = true;
        }
      }
    });
  }, [section, boatGroup]);

  useFrame((_, dt) => {
    const controls = controlsRef.current;
    if (!controls) return;
    const d = Math.min(dt, 0.05);

    // 카메라 트윈
    if (tween.current.active) {
      controls.enabled = false;
      const [px, py, pz] = section.camera.position;
      const [tx, ty, tz] = section.camera.target;
      const L = 3.2;
      camera.position.x = THREE.MathUtils.damp(camera.position.x, px, L, d);
      camera.position.y = THREE.MathUtils.damp(camera.position.y, py, L, d);
      camera.position.z = THREE.MathUtils.damp(camera.position.z, pz, L, d);
      controls.target.x = THREE.MathUtils.damp(controls.target.x, tx, L, d);
      controls.target.y = THREE.MathUtils.damp(controls.target.y, ty, L, d);
      controls.target.z = THREE.MathUtils.damp(controls.target.z, tz, L, d);
      if (
        camera.position.distanceTo(new THREE.Vector3(px, py, pz)) < 0.06 &&
        controls.target.distanceTo(new THREE.Vector3(tx, ty, tz)) < 0.06
      ) {
        tween.current.active = false;
        controls.enabled = true;
      }
    }
    controls.update();

    // 내부 모드: 내부 섹션이거나, 오버뷰에서 충분히 줌인했을 때 (히스테리시스)
    const dist = camera.position.distanceTo(controls.target);
    if (section.interior) interiorRef.current = true;
    else if (section.key === "overview") {
      if (dist < 8.5) interiorRef.current = true;
      else if (dist > 10.5) interiorRef.current = false;
    } else interiorRef.current = false;

    // 페이드
    const extTarget = interiorRef.current ? 0.07 : 1;
    const hullTarget = interiorRef.current ? 0.14 : 1;
    for (const m of extMats.current) {
      m.opacity = THREE.MathUtils.damp(m.opacity, extTarget, 7, d);
      m.depthWrite = m.opacity > 0.5;
    }
    const hm = hullMat.current;
    if (hm) {
      hm.opacity = THREE.MathUtils.damp(hm.opacity, hullTarget, 7, d);
      hm.depthWrite = hm.opacity > 0.5;
    }
  });

  return (
    <OrbitControls
      ref={controlsRef}
      makeDefault
      enableDamping
      dampingFactor={0.08}
      minDistance={2.5}
      maxDistance={42}
      maxPolarAngle={Math.PI * 0.62}
      target={[0.3, 0.4, 0]}
    />
  );
}

/* ---------------- 씬 루트 ---------------- */

export default function Scene3D({
  section,
  devices,
  readings,
  selectedId,
  onSelect,
}: {
  section: Section;
  devices: Device[];
  readings: Record<string, DeviceReading>;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
}) {
  const hullGeo = useMemo(() => buildLoft("hull"), []);
  const hullMat = useRef<THREE.MeshStandardMaterial>(null);
  const extGroup = useRef<THREE.Group>(null);
  const boatGroup = useRef<THREE.Group>(null);

  return (
    <>
      {/* 조명/분위기 */}
      <hemisphereLight intensity={0.55} color="#f0f9ff" groundColor="#cbd5e1" />
      <directionalLight
        position={[9, 14, 7]}
        intensity={1.5}
        castShadow
        shadow-mapSize={[1024, 1024]}
        shadow-camera-left={-14}
        shadow-camera-right={14}
        shadow-camera-top={14}
        shadow-camera-bottom={-14}
      />
      <directionalLight position={[-7, 5, -9]} intensity={0.35} />
      <fog attach="fog" args={["#dbe7f0", 38, 110]} />
      <color attach="background" args={["#e8eef4"]} />

      {/* 물 */}
      <mesh rotation-x={-Math.PI / 2} position={[0, 0, 0]} receiveShadow>
        <circleGeometry args={[70, 48]} />
        <meshStandardMaterial color="#7dd3fc" transparent opacity={0.55} roughness={0.2} />
      </mesh>

      {/* 보트 (클리핑 대상 그룹) */}
      <group ref={boatGroup}>
        <mesh geometry={hullGeo} castShadow receiveShadow>
          <meshStandardMaterial
            ref={hullMat}
            color="#f8fafc"
            roughness={0.35}
            metalness={0.05}
            side={THREE.DoubleSide}
            transparent
          />
        </mesh>

        {/* 킬 + 벌브 + 러더 */}
        <mesh position={[0.4, -1.55, 0]} castShadow>
          <boxGeometry args={[1.5, 1.5, 0.26]} />
          <meshStandardMaterial color="#94a3b8" roughness={0.4} transparent />
        </mesh>
        <mesh position={[0.35, -2.25, 0]} rotation-z={Math.PI / 2}>
          <capsuleGeometry args={[0.17, 1.5, 6, 12]} />
          <meshStandardMaterial color="#94a3b8" roughness={0.4} transparent />
        </mesh>
        <mesh position={[-6.9, -1.02, 0]} castShadow>
          <boxGeometry args={[0.42, 1.1, 0.1]} />
          <meshStandardMaterial color="#94a3b8" roughness={0.4} transparent />
        </mesh>

        <group ref={extGroup}>
          <Exterior />
        </group>
        <Interior />
      </group>

      <DeviceMarkers
        devices={devices}
        readings={readings}
        selectedId={selectedId}
        onSelect={onSelect}
        section={section}
      />

      <Rig section={section} extGroup={extGroup} hullMat={hullMat} boatGroup={boatGroup} />
    </>
  );
}
