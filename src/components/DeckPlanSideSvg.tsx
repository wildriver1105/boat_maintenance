// 선박 측면(프로파일) 도면 — Oceanis Clipper 473, 2D 내부 단면(컷어웨이).
// 좌표계는 평면 뷰와 동일한 viewBox 0 0 2000 850.
// 관측 방향(항해 관례):
//   우현(starboard)에서 보면 뱃머리가 오른쪽,
//   좌현(port)에서 보면 반대편에서 보는 것이므로 뱃머리가 왼쪽 → mirror 로 좌우 반전.
// mirror=true 일 때: 지오메트리는 그룹 변환(translate(2000,0) scale(-1,1))으로 뒤집고,
//   텍스트는 뒤집히지 않도록 별도 그룹에서 x 만 (2000-x) 로 반영해 정상 방향으로 렌더.
//
// side='port' → 후방 좌현 선실, 후방 헤드, 살롱 세틀리, 오너 선실
// side='starboard' → 후방 우현 선실, 갤리, 항해석, 전방 헤드, 오너 선실
// 솔(sole, y≈500) 아래는 빌지/탱크 공간 — 이후 사용자가 편집 모드로 장비를 배치.

"use client";

type Props = {
  side: "port" | "starboard";
  mirror?: boolean;
  /** 레이어 가시성 (키: rigging/deck/interior/labels, 기본 모두 표시) */
  layers?: Record<string, boolean>;
};

export default function DeckPlanSideSvg({ side, mirror = false, layers }: Props) {
  const on = (k: string) => layers?.[k] !== false;
  const isPort = side === "port";
  const mx = (x: number) => (mirror ? 2000 - x : x);

  const sections = isPort
    ? [
        { x: 360, y: 352, t: "콕핏" },
        { x: 400, y: 446, t: "후방 선실" },
        { x: 690, y: 396, t: "헤드" },
        { x: 1070, y: 392, t: "살롱" },
        { x: 1480, y: 428, t: "오너 선실" },
      ]
    : [
        { x: 360, y: 352, t: "콕핏" },
        { x: 400, y: 446, t: "후방 선실" },
        { x: 700, y: 396, t: "갤리" },
        { x: 1070, y: 392, t: "살롱" },
        { x: 1320, y: 418, t: "항해석" },
        { x: 1560, y: 428, t: "오너 선실" },
      ];

  return (
    <>
      <defs>
        <pattern id="bilgeHatch" width="14" height="14" patternUnits="userSpaceOnUse">
          <line x1="0" y1="14" x2="14" y2="0" stroke="#e2e8f0" strokeWidth="1.5" />
        </pattern>
      </defs>

      {/* ---------- 물 (좌우 대칭이라 미러 불필요) ---------- */}
      <rect x="0" y="470" width="2000" height="380" fill="#e0f2fe" opacity="0.35" />
      <line x1="60" y1="470" x2="1960" y2="470" stroke="#38bdf8" strokeWidth="2" strokeDasharray="10 8" opacity="0.7" />

      {/* ============ 지오메트리 (미러 대상) ============ */}
      <g transform={mirror ? "translate(2000,0) scale(-1,1)" : undefined}>
        {/* ---------- 리깅 (마스트/붐/스테이) ---------- */}
        {on("rigging") && (
        <g stroke="#94a3b8" fill="none">
          <line x1="1172" y1="48" x2="1898" y2="286" strokeWidth="1.5" />
          <line x1="1172" y1="48" x2="196" y2="300" strokeWidth="1.5" />
          <line x1="1172" y1="254" x2="1172" y2="44" strokeWidth="5" stroke="#64748b" />
          <line x1="1172" y1="150" x2="660" y2="164" strokeWidth="4" stroke="#64748b" />
        </g>
        )}

        {/* ---------- 선체 프로파일 ---------- */}
        <path
          d="M175,320
             C600,295 1200,275 1660,262
             C1790,258 1885,268 1932,286
             C1918,350 1910,415 1900,468
             C1650,542 1350,568 1050,574
             C800,578 550,560 380,535
             C300,523 250,510 232,498
             Z"
          fill="#f8fafc"
          stroke="#334155"
          strokeWidth="5"
        />
        {/* 킬 */}
        <path
          d="M870,568 C880,676 895,752 918,756 L1018,750 C1040,698 1052,620 1058,562 Z"
          fill="#e2e8f0"
          stroke="#334155"
          strokeWidth="3"
        />
        {/* 러더 */}
        <path
          d="M332,528 C326,600 336,676 356,698 L394,688 C400,620 398,562 396,532 Z"
          fill="#e2e8f0"
          stroke="#334155"
          strokeWidth="3"
        />

        {/* ---------- 데크 구조물 ---------- */}
        {on("deck") && (<>
        <g stroke="#334155" strokeWidth="3" fill="#f1f5f9">
          {/* 코치루프(캐빈 트렁크) */}
          <path d="M500,306 C540,282 620,272 740,268 L1330,254 C1430,252 1500,257 1558,265 L500,306 Z" />
        </g>
        {/* 트렁크 윈도우 */}
        <g fill="#bae6fd" stroke="#60a5fa" strokeWidth="1.5">
          <rect x="690" y="276" width="130" height="15" rx="7" />
          <rect x="860" y="271" width="145" height="15" rx="7" />
          <rect x="1045" y="265" width="145" height="15" rx="7" />
        </g>
        {/* 콕핏: 휠 + 페데스탈 + 레일 */}
        <g stroke="#64748b" strokeWidth="3" fill="none">
          <circle cx="335" cy="272" r="28" />
          <line x1="335" y1="300" x2="335" y2="318" />
          <line x1="316" y1="252" x2="354" y2="292" strokeWidth="1.5" />
          <line x1="354" y1="252" x2="316" y2="292" strokeWidth="1.5" />
          {/* 푸시핏/펄핏 */}
          <path d="M188,318 L188,282 L256,286" strokeWidth="2.5" />
          <path d="M1898,286 L1848,260 L1795,260" strokeWidth="2.5" />
        </g>
        </>)}

        {/* ---------- 내부 단면 ---------- */}
        {on("interior") && (<>
        {/* 빌지/탱크 공간 (솔 아래) */}
        <path
          d="M382,508 L1768,474 C1600,540 1300,566 1050,572 C820,576 560,554 382,508 Z"
          fill="url(#bilgeHatch)"
          opacity="0.6"
        />
        {/* 캐빈 솔 라인 */}
        <path d="M380,506 L1500,492 L1768,472" stroke="#94a3b8" strokeWidth="2" fill="none" />
        {/* 콕핏 플로어(후방 선실 천장) */}
        <line x1="238" y1="392" x2="518" y2="382" stroke="#cbd5e1" strokeWidth="2.5" />
        {/* 격벽 */}
        <g stroke="#cbd5e1" strokeWidth="2.5">
          <line x1="560" y1="304" x2="560" y2="554" />
          <line x1="905" y1="288" x2="905" y2="572" />
          <line x1="1230" y1="278" x2="1230" y2="566" />
          <line x1="1795" y1="264" x2="1795" y2="472" />
        </g>

        {/* 컴패니언웨이 계단 */}
        <path
          d="M614,302 L634,302 L634,342 L654,342 L654,382 L674,382 L674,422 L694,422 L694,462 L714,462 L714,500"
          stroke="#64748b"
          strokeWidth="2.5"
          fill="none"
        />
        {/* 엔진 (계단 아래, 빌지) + 샤프트/프로펠러 */}
        <g>
          <rect x="726" y="506" width="126" height="56" rx="8" fill="#e2e8f0" stroke="#475569" strokeWidth="2.5" />
          <line x1="748" y1="506" x2="748" y2="562" stroke="#94a3b8" strokeWidth="1.5" />
          <line x1="726" y1="534" x2="852" y2="534" stroke="#94a3b8" strokeWidth="1.5" />
          <line x1="726" y1="546" x2="640" y2="566" stroke="#64748b" strokeWidth="2" />
          <ellipse cx="632" cy="568" rx="5" ry="12" fill="#cbd5e1" stroke="#64748b" strokeWidth="1.5" />
        </g>

        {/* 후방 선실 베드 (콕핏 아래) */}
        <g fill="#eef2f7" stroke="#b8c2cf" strokeWidth="2">
          <path d="M258,470 L546,466 L546,486 L258,490 Z" fill="#ffffff" />
          <rect x="320" y="488" width="216" height="26" />
          <ellipse cx="296" cy="464" rx="22" ry="8" fill="#f8fafc" />
        </g>

        {/* 오너 선실 베드 (전방) */}
        <g fill="#eef2f7" stroke="#b8c2cf" strokeWidth="2">
          <path d="M1298,488 L1692,462 L1692,478 L1298,504 Z" />
          <path d="M1312,472 L1662,450 L1662,462 L1312,486 Z" fill="#ffffff" />
          <ellipse cx="1622" cy="448" rx="24" ry="8" fill="#f8fafc" />
        </g>

        {isPort ? (
          /* ===== 좌현 내부 (지오메트리) ===== */
          <g>
            {/* 후방 헤드: 카운터 + 세면대 + 변기 */}
            <g fill="#eef2f7" stroke="#b8c2cf" strokeWidth="2">
              <rect x="572" y="426" width="226" height="78" rx="4" />
              <path d="M700,426 q16,-16 34,0" fill="none" />
              <rect x="606" y="446" width="36" height="24" rx="8" fill="#ffffff" />
              <rect x="614" y="470" width="20" height="34" fill="#ffffff" />
            </g>
            {/* 살롱 세틀리 + 오버헤드 로커 */}
            <g fill="#eef2f7" stroke="#b8c2cf" strokeWidth="2">
              <rect x="932" y="398" width="16" height="72" rx="4" />
              <rect x="932" y="452" width="290" height="18" rx="4" fill="#ffffff" />
              <rect x="944" y="470" width="268" height="30" />
              <rect x="944" y="330" width="272" height="32" rx="6" />
            </g>
          </g>
        ) : (
          /* ===== 우현 내부 (지오메트리) ===== */
          <g>
            {/* 갤리: 카운터 + 스토브 + 싱크 + 오버헤드 로커 */}
            <g fill="#eef2f7" stroke="#b8c2cf" strokeWidth="2">
              <rect x="580" y="430" width="312" height="18" rx="3" fill="#ffffff" />
              <rect x="590" y="448" width="294" height="56" />
              <line x1="668" y1="448" x2="668" y2="504" stroke="#cbd5e1" />
              <line x1="770" y1="448" x2="770" y2="504" stroke="#cbd5e1" />
              <rect x="682" y="408" width="78" height="22" rx="4" fill="#ffffff" />
              <circle cx="696" cy="440" r="3" fill="#94a3b8" stroke="none" />
              <circle cx="712" cy="440" r="3" fill="#94a3b8" stroke="none" />
              <circle cx="728" cy="440" r="3" fill="#94a3b8" stroke="none" />
              <rect x="806" y="432" width="52" height="12" fill="#ffffff" />
              <path d="M828,432 q0,-16 14,-14" fill="none" stroke="#94a3b8" />
              <rect x="600" y="330" width="280" height="32" rx="6" />
            </g>
            {/* 항해석: 경사 데스크 + 스툴 */}
            <g fill="#eef2f7" stroke="#b8c2cf" strokeWidth="2">
              <path d="M1250,442 L1398,434 L1398,450 L1250,460 Z" fill="#ffffff" />
              <rect x="1262" y="460" width="118" height="34" />
              <rect x="1424" y="462" width="34" height="9" rx="4" fill="#ffffff" />
              <line x1="1441" y1="471" x2="1441" y2="492" stroke="#94a3b8" />
            </g>
            {/* 전방 헤드 (컴팩트) */}
            <g fill="#eef2f7" stroke="#b8c2cf" strokeWidth="2">
              <rect x="1198" y="500" width="26" height="14" rx="6" fill="#ffffff" transform="rotate(-2 1211 507)" />
            </g>
          </g>
        )}
        </>)}
      </g>

      {/* ============ 구획 라벨 (미러 안 함, x 만 반영) ============ */}
      {on("labels") && (
      <g fill="#94a3b8" fontSize="15" textAnchor="middle" stroke="none">
        {sections.map((s) => (
          <text key={s.t} x={mx(s.x)} y={s.y}>
            {s.t}
          </text>
        ))}
      </g>
      )}

      {/* ---------- 방향/뷰 표시 (좌상단 고정) ---------- */}
      <g fill="#64748b" stroke="none">
        <text x="150" y="86" fontSize="21" fontWeight="600">
          {isPort ? "좌현 (PORT)" : "우현 (STARBOARD)"}
        </text>
        <text x="150" y="110" fontSize="14" fill="#94a3b8">
          {mirror ? "선수(BOW) ← 왼쪽" : "선수(BOW) → 오른쪽"} · 솔 아래 = 빌지/탱크
        </text>
      </g>
    </>
  );
}
