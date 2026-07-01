// 선박 평면(단면) 도면 — 원본을 참고한 semantic 재작도.
// 좌표계: viewBox 0 0 2000 850, 뱃머리(bow)는 오른쪽, 선미(stern)는 왼쪽.
// 레이어 구조:
//   #hull        선체 외곽/데크 라인
//   #bulkheads   격벽
//   #zones       클릭 가능한 구역 (id: zone-*)
//   #furniture   가구/장식 (비상호작용)
// 각 구역/부품은 id 로 식별되어 하이라이트·스타일링이 가능합니다.

"use client";

import { CATEGORY_META } from "@/lib/types";

type Props = {
  activeZone?: string | null;
  onZoneClick?: (zoneId: string) => void;
};

const ZONES: { id: string; label: string; d: string }[] = [
  // 선미(좌) → 뱃머리(우)
  { id: "zone-aft-cabin-port", label: "후방 선실 (좌현)", d: "M175,300 L520,300 L520,415 L175,430 Z" },
  { id: "zone-aft-cabin-stbd", label: "후방 선실 (우현)", d: "M175,435 L520,420 L520,545 L200,548 Z" },
  { id: "zone-companionway", label: "컴패니언웨이/엔진", d: "M520,300 L690,300 L690,548 L520,548 Z" },
  { id: "zone-galley", label: "갤리", d: "M690,430 L905,430 L905,595 L690,595 Z" },
  { id: "zone-saloon", label: "살롱", d: "M690,300 L1230,300 L1230,430 L905,430 L905,595 L690,595 Z" },
  { id: "zone-head-fwd", label: "헤드 (전방)", d: "M905,155 L1075,155 L1075,300 L905,300 Z" },
  { id: "zone-nav", label: "항해석", d: "M1230,430 L1470,455 L1440,600 L1210,560 Z" },
  { id: "zone-owner-cabin", label: "오너 선실 (전방 V-berth)", d: "M1230,175 L1720,235 L1780,430 L1620,560 L1230,470 Z" },
];

export default function DeckPlanSvg({ activeZone, onZoneClick }: Props) {
  return (
    <>
      {/* ---------- 선체 외곽 ---------- */}
      <g id="hull" fill="none" stroke="#334155" strokeWidth={5}>
        <path
          d="M150,300
             C300,168 700,150 1100,160
             C1500,175 1760,232 1955,425
             C1760,618 1500,675 1100,690
             C700,700 300,682 150,552
             C86,470 86,382 150,300 Z"
          fill="#f8fafc"
        />
        {/* 데크 안쪽 라인 */}
        <path
          d="M182,320
             C320,205 700,188 1100,198
             C1480,210 1712,262 1885,425
             C1712,588 1480,640 1100,652
             C700,662 320,645 182,532
             C130,470 130,382 182,320 Z"
          stroke="#cbd5e1"
          strokeWidth={2}
        />
      </g>

      {/* ---------- 클릭 가능한 구역 ---------- */}
      <g id="zones">
        {ZONES.map((z) => {
          const active = activeZone === z.id;
          return (
            <path
              key={z.id}
              id={z.id}
              data-zone={z.id}
              d={z.d}
              fill={active ? "rgba(14,165,233,0.14)" : "transparent"}
              stroke={active ? "#0ea5e9" : "#e2e8f0"}
              strokeWidth={active ? 2 : 1}
              strokeDasharray="4 4"
              className={onZoneClick ? "cursor-pointer transition-colors hover:fill-sky-500/5" : ""}
              onClick={onZoneClick ? () => onZoneClick(z.id) : undefined}
            >
              <title>{z.label}</title>
            </path>
          );
        })}
      </g>

      {/* ---------- 격벽 ---------- */}
      <g id="bulkheads" stroke="#94a3b8" strokeWidth={3} strokeLinecap="round">
        <line x1="520" y1="300" x2="520" y2="548" />
        <line x1="690" y1="300" x2="690" y2="595" />
        <line x1="905" y1="155" x2="905" y2="300" />
        <line x1="1230" y1="300" x2="1230" y2="470" />
      </g>

      {/* ---------- 가구/장식 (비상호작용) ---------- */}
      <g id="furniture" fill="none" stroke="#b8c2cf" strokeWidth={2} pointerEvents="none">
        {/* 후방 선실 좌현: 침대 */}
        <rect x="195" y="315" width="300" height="100" rx="10" fill="#eef2f7" />
        {/* 후방 선실 우현: 침대/좌석 */}
        <rect x="205" y="450" width="300" height="85" rx="10" fill="#eef2f7" />
        {/* 헤드 전방: 세면대/변기 */}
        <circle cx="960" cy="205" r="20" fill="#eef2f7" />
        <rect x="1000" y="185" width="55" height="95" rx="8" fill="#eef2f7" />
        {/* 살롱: 세틀리 소파 (U자) */}
        <path d="M960,320 h250 a18,18 0 0 1 18,18 v70 h-40 v-48 h-228 z" fill="#eef2f7" />
        {/* 살롱 테이블 */}
        <rect x="980" y="360" width="150" height="60" rx="14" fill="#e2e8f0" />
        {/* 갤리: 스토브(그리드) */}
        <rect x="705" y="500" width="90" height="80" rx="6" fill="#eef2f7" />
        <line x1="735" y1="500" x2="735" y2="580" />
        <line x1="765" y1="500" x2="765" y2="580" />
        <line x1="705" y1="527" x2="795" y2="527" />
        <line x1="705" y1="554" x2="795" y2="554" />
        {/* 갤리: 싱크 */}
        <rect x="825" y="505" width="65" height="60" rx="8" fill="#eef2f7" />
        {/* 오너 선실: V-berth 쿠션 */}
        <path d="M1300,250 L1680,300 L1720,420 L1560,520 L1300,450 Z" fill="#eef2f7" />
        {/* 항해석 좌석 */}
        <rect x="1250" y="480" width="120" height="70" rx="10" fill="#eef2f7" transform="rotate(6 1310 515)" />
      </g>

      {/* 카테고리 색상 참조(스크린리더/디버그용, 화면엔 미표시) */}
      <metadata>{Object.keys(CATEGORY_META).join(",")}</metadata>
    </>
  );
}
