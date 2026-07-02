// 선박 평면(위에서 본) 도면 — Oceanis Clipper 473 원본 도면을 참고한 정밀 semantic 재작도.
// 좌표계: viewBox 0 0 2000 850, 뱃머리(bow)=오른쪽, 선미(stern)=왼쪽, 상단=좌현(port).
//
// 배치 (원본 이미지 기준):
//  - 선미 좌현: 후방 선실(더블 베드+베개) / 선미 우현: 후방 선실(수납/세일백)
//  - 좌현 중앙: 후방 헤드(변기·세면대·샤워) + 행잉 로커(사선 해칭)
//  - 중앙: 컴패니언웨이(부채꼴 계단) + 엔진(계단 아래)
//  - 우현 중앙: 갤리(짐벌 스토브 그리드 + 더블 싱크 + 하부 로커)
//  - 살롱: U자 세틀리(좌현) + 접이식 테이블 + 세틀리(우현), 마스트
//  - 우현 전방: 항해석(차트 테이블+스툴), 컴팩트 헤드
//  - 전방: 오너 선실(아일랜드 베드+베개, 사이드 벤치, 화장대), 뱃머리 로커
//
// 레이어: #hull / #sole(바닥 플랭크) / #zones(클릭 영역) / #bulkheads(격벽+문) / #furniture / #portlights

"use client";

type Props = {
  activeZone?: string | null;
  onZoneClick?: (zoneId: string) => void;
};

const ZONES: { id: string; label: string; d: string }[] = [
  { id: "zone-aft-cabin-port", label: "후방 선실 (좌현)", d: "M162,308 C182,214 300,164 520,154 L556,154 L556,422 L146,422 Z" },
  { id: "zone-aft-cabin-stbd", label: "후방 선실 (우현)", d: "M146,428 L556,428 L556,696 L520,696 C300,686 182,636 162,542 C150,504 144,466 146,428 Z" },
  { id: "zone-aft-head", label: "후방 헤드 (좌현)", d: "M560,150 L808,150 L808,308 L560,308 Z" },
  { id: "zone-companionway", label: "컴패니언웨이/엔진", d: "M560,312 L903,312 L903,468 L560,468 Z" },
  { id: "zone-galley", label: "갤리 (우현)", d: "M560,472 L903,472 L903,698 L560,698 Z" },
  { id: "zone-saloon", label: "살롱", d: "M907,150 L1228,150 L1228,698 L907,698 Z" },
  { id: "zone-nav", label: "항해석 (우현)", d: "M1240,452 L1428,476 L1410,558 L1236,534 Z" },
  { id: "zone-fwd-head", label: "전방 헤드 (우현)", d: "M1186,544 L1330,556 L1322,664 L1194,652 Z" },
  { id: "zone-owner-cabin", label: "오너 선실 (전방)", d: "M1232,152 C1420,168 1640,240 1790,425 C1640,610 1420,682 1232,698 Z" },
  { id: "zone-bow", label: "뱃머리 로커", d: "M1794,330 C1850,362 1902,394 1930,425 C1902,456 1850,488 1794,520 Z" },
];

// 사선 해칭(행잉 로커 "WWW" 표시)용 지그재그 한 줄
function Zigzag({ x, y, n = 5, w = 11, h = 13 }: { x: number; y: number; n?: number; w?: number; h?: number }) {
  let d = `M${x},${y}`;
  for (let i = 0; i < n; i++) d += ` l${w},${h} l${w},${-h}`;
  return <path d={d} fill="none" stroke="#94a3b8" strokeWidth={1.5} />;
}

export default function DeckPlanSvg({ activeZone, onZoneClick }: Props) {
  return (
    <>
      <defs>
        {/* 캐빈 솔(바닥) 플랭크 라인 */}
        <pattern id="sole" width="16" height="11" patternUnits="userSpaceOnUse">
          <line x1="0" y1="5" x2="16" y2="5" stroke="#e6ebf2" strokeWidth="1.5" />
        </pattern>
      </defs>

      {/* ---------- 선체 ---------- */}
      <g id="hull">
        <path
          d="M160,315
             C178,215 300,162 520,152
             C840,142 1120,150 1380,192
             C1620,230 1800,315 1935,425
             C1800,535 1620,620 1380,658
             C1120,700 840,708 520,698
             C300,688 178,635 160,535
             C144,462 144,388 160,315 Z"
          fill="#f8fafc"
          stroke="#334155"
          strokeWidth={5}
        />
        {/* 데크 안쪽 라인 */}
        <path
          d="M186,330
             C202,238 315,185 525,176
             C840,166 1115,174 1370,214
             C1595,250 1762,330 1878,425
             C1762,520 1595,600 1370,636
             C1115,684 840,692 525,674
             C315,665 202,612 186,520
             C172,455 172,395 186,330 Z"
          fill="none"
          stroke="#cbd5e1"
          strokeWidth={2}
        />
      </g>

      {/* ---------- 바닥(솔) 플랭크 ---------- */}
      <g id="sole">
        <rect x="566" y="316" width="336" height="148" fill="url(#sole)" />
        <rect x="912" y="352" width="300" height="168" fill="url(#sole)" />
        <rect x="1238" y="298" width="60" height="256" fill="url(#sole)" />
        <rect x="212" y="480" width="318" height="176" fill="url(#sole)" />
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
              fill={active ? "rgba(14,165,233,0.12)" : "transparent"}
              stroke={active ? "#0ea5e9" : "#eef2f7"}
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

      {/* ---------- 격벽 + 문(스윙 아크) ---------- */}
      <g id="bulkheads" stroke="#475569" strokeWidth={3} strokeLinecap="round" fill="none">
        {/* 후방 선실 전방 격벽 (x=560), 문 2개 */}
        <line x1="560" y1="152" x2="560" y2="348" />
        <line x1="560" y1="404" x2="560" y2="446" />
        <line x1="560" y1="502" x2="560" y2="698" />
        {/* 후방 헤드 벽 */}
        <line x1="810" y1="148" x2="810" y2="310" />
        <line x1="560" y1="310" x2="726" y2="310" />
        <line x1="786" y1="310" x2="810" y2="310" />
        {/* 살롱/오너 격벽 (x=1230), 오너 선실 문 */}
        <line x1="1230" y1="152" x2="1230" y2="388" />
        <line x1="1230" y1="452" x2="1230" y2="545" />
        {/* 전방 헤드 벽 */}
        <path d="M1188,545 L1240,550 M1284,554 L1330,558 M1330,558 L1322,660" />
        {/* 뱃머리 수밀 격벽 */}
        <path d="M1794,322 Q1814,425 1794,528" strokeWidth={2.5} />
        {/* 문 스윙 아크 */}
        <g stroke="#94a3b8" strokeWidth={1.5}>
          <path d="M560,348 A56,56 0 0 1 504,404" />
          <path d="M560,502 A56,56 0 0 0 504,446" />
          <path d="M726,310 A60,60 0 0 0 786,370" />
          <path d="M1230,388 A64,64 0 0 1 1294,452" />
          <path d="M1240,550 A44,44 0 0 1 1284,594" />
        </g>
      </g>

      {/* ---------- 가구/장식 (비상호작용) ---------- */}
      <g id="furniture" fill="none" stroke="#94a3b8" strokeWidth={2} pointerEvents="none">
        {/* ===== 후방 선실 (좌현): 더블 베드 + 베개 ===== */}
        <g>
          <rect x="196" y="196" width="336" height="150" rx="14" fill="#ffffff" />
          <line x1="200" y1="271" x2="528" y2="271" stroke="#cbd5e1" />
          {/* 이불 주름 */}
          <path d="M310,198 Q348,271 310,344" stroke="#dbe3ec" />
          <path d="M338,198 Q372,271 338,344" stroke="#e6ebf2" />
          {/* 베개 (선미 쪽) */}
          <g fill="#f8fafc" stroke="#b8c2cf">
            <rect x="208" y="206" width="58" height="56" rx="12" transform="rotate(-7 237 234)" />
            <rect x="208" y="278" width="58" height="56" rx="12" transform="rotate(6 237 306)" />
            <path d="M222,222 l28,24 M222,296 l28,22" stroke="#dbe3ec" strokeWidth={1.5} />
          </g>
          {/* 풋 로커 */}
          <rect x="196" y="366" width="118" height="50" rx="8" fill="#eef2f7" stroke="#b8c2cf" />
        </g>

        {/* ===== 후방 선실 (우현): 수납(세일백) ===== */}
        <g>
          <path d="M356,536 q28,-30 64,-16 q38,14 30,52 q-8,34 -48,32 q-42,-2 -50,-32 q-6,-22 4,-36 Z" fill="#eef2f7" stroke="#b8c2cf" />
          <path d="M378,552 q22,-12 40,0" stroke="#cbd5e1" strokeWidth={1.5} />
          <path d="M458,566 q22,-24 52,-13 q30,11 24,42 q-6,27 -38,26 q-34,-2 -40,-26 q-5,-17 2,-29 Z" fill="#eef2f7" stroke="#b8c2cf" />
          <path d="M476,580 q18,-10 32,0" stroke="#cbd5e1" strokeWidth={1.5} />
          <rect x="230" y="636" width="200" height="42" rx="8" fill="#eef2f7" stroke="#b8c2cf" />
        </g>

        {/* ===== 후방 헤드 (좌현): 로커 + 변기 + 세면대 + 샤워 ===== */}
        <g>
          {/* 행잉 로커 (WWW) */}
          <rect x="566" y="154" width="58" height="88" fill="#eef2f7" stroke="#b8c2cf" />
          <Zigzag x={569} y={170} n={5} w={5.5} h={12} />
          <Zigzag x={569} y={204} n={5} w={5.5} h={12} />
          {/* 변기 (상단 벽 붙임) */}
          <rect x="670" y="156" width="38" height="15" rx="4" fill="#ffffff" />
          <ellipse cx="689" cy="196" rx="17" ry="22" fill="#ffffff" />
          <ellipse cx="689" cy="198" rx="10" ry="14" stroke="#cbd5e1" />
          {/* 세면대 카운터 */}
          <rect x="726" y="152" width="78" height="76" rx="10" fill="#eef2f7" />
          <circle cx="765" cy="190" r="17" fill="#ffffff" />
          <circle cx="765" cy="190" r="8" stroke="#cbd5e1" />
          <circle cx="765" cy="167" r="3" fill="#94a3b8" />
          {/* 샤워 */}
          <circle cx="606" cy="278" r="6" stroke="#b8c2cf" />
          <path d="M598,266 l-8,-10 M606,264 v-13 M614,266 l8,-10" stroke="#b8c2cf" strokeWidth={1.5} />
        </g>

        {/* ===== 컴패니언웨이: 부채꼴 계단 + 엔진 해치 ===== */}
        <g>
          <line x1="640" y1="352" x2="640" y2="476" stroke="#64748b" strokeWidth={2.5} />
          <path d="M642,392 A22,22 0 0 1 642,436" stroke="#64748b" />
          <path d="M642,374 A40,40 0 0 1 642,454" stroke="#64748b" />
          <path d="M642,356 A58,58 0 0 1 642,472" stroke="#64748b" />
          <path d="M642,338 A76,76 0 0 1 642,490" stroke="#64748b" />
          {/* 엔진 해치 (점선) */}
          <rect x="736" y="366" width="150" height="94" rx="8" stroke="#cbd5e1" strokeDasharray="6 4" />
        </g>

        {/* ===== 갤리 (우현): 냉장고/스토브/싱크/하부 로커 ===== */}
        <g>
          {/* 냉장고/카운터 */}
          <rect x="572" y="478" width="88" height="96" rx="6" fill="#eef2f7" stroke="#b8c2cf" />
          <line x1="572" y1="526" x2="660" y2="526" stroke="#cbd5e1" />
          {/* 짐벌 스토브 (그리드) */}
          <rect x="676" y="486" width="84" height="98" rx="6" fill="#ffffff" stroke="#64748b" />
          <line x1="704" y1="486" x2="704" y2="584" stroke="#94a3b8" />
          <line x1="732" y1="486" x2="732" y2="584" stroke="#94a3b8" />
          <line x1="676" y1="519" x2="760" y2="519" stroke="#94a3b8" />
          <line x1="676" y1="552" x2="760" y2="552" stroke="#94a3b8" />
          <circle cx="690" cy="502" r="8" stroke="#cbd5e1" />
          <circle cx="746" cy="502" r="8" stroke="#cbd5e1" />
          <circle cx="690" cy="568" r="8" stroke="#cbd5e1" />
          <circle cx="746" cy="568" r="8" stroke="#cbd5e1" />
          {/* 싱크 (더블) */}
          <rect x="778" y="488" width="118" height="86" rx="10" fill="#eef2f7" stroke="#b8c2cf" />
          <rect x="792" y="500" width="40" height="54" rx="7" fill="#ffffff" />
          <rect x="840" y="500" width="40" height="54" rx="7" fill="#ffffff" />
          <circle cx="836" cy="494" r="4" fill="#94a3b8" />
          {/* 하부 로커 (선체 곡선 따라) */}
          <rect x="592" y="602" width="92" height="70" rx="5" fill="#eef2f7" stroke="#b8c2cf" />
          <rect x="692" y="610" width="92" height="64" rx="5" fill="#eef2f7" stroke="#b8c2cf" />
          <rect x="792" y="616" width="92" height="58" rx="5" fill="#eef2f7" stroke="#b8c2cf" />
        </g>

        {/* ===== 살롱: U 세틀리(좌현) + 테이블 + 세틀리(우현) + 마스트 ===== */}
        <g>
          {/* 좌현 세틀리: 등받이 + 좌석 + 양팔 */}
          <rect x="920" y="212" width="318" height="52" rx="14" fill="#eef2f7" stroke="#b8c2cf" />
          <rect x="918" y="212" width="48" height="132" rx="12" fill="#eef2f7" stroke="#b8c2cf" />
          <rect x="1190" y="212" width="48" height="132" rx="12" fill="#eef2f7" stroke="#b8c2cf" />
          <rect x="972" y="266" width="212" height="70" rx="12" fill="#ffffff" />
          <line x1="1042" y1="266" x2="1042" y2="336" stroke="#cbd5e1" />
          <line x1="1112" y1="266" x2="1112" y2="336" stroke="#cbd5e1" />
          <path d="M1002,296 h10 M1007,291 v10 M1072,296 h10 M1077,291 v10 M1146,296 h10 M1151,291 v10" stroke="#94a3b8" strokeWidth={1.5} />
          {/* 테이블 (접이식 리프) */}
          <rect x="975" y="368" width="190" height="86" rx="16" fill="#e2e8f0" stroke="#94a3b8" />
          <rect x="987" y="378" width="166" height="66" rx="10" stroke="#cbd5e1" />
          <line x1="1070" y1="370" x2="1070" y2="452" stroke="#cbd5e1" />
          {/* 우현 세틀리 */}
          <rect x="920" y="584" width="266" height="50" rx="14" fill="#eef2f7" stroke="#b8c2cf" />
          <rect x="918" y="506" width="46" height="128" rx="12" fill="#eef2f7" stroke="#b8c2cf" />
          <rect x="1138" y="506" width="46" height="128" rx="12" fill="#eef2f7" stroke="#b8c2cf" />
          <rect x="970" y="514" width="162" height="68" rx="12" fill="#ffffff" />
          <line x1="1052" y1="514" x2="1052" y2="582" stroke="#cbd5e1" />
          <path d="M1006,546 h10 M1011,541 v10 M1090,546 h10 M1095,541 v10" stroke="#94a3b8" strokeWidth={1.5} />
          {/* 마스트/컴프레션 포스트 */}
          <ellipse cx="1202" cy="425" rx="10" ry="7" fill="#cbd5e1" stroke="#64748b" />
        </g>

        {/* ===== 항해석 (우현): 차트 테이블 + 스툴 ===== */}
        <g>
          <path d="M1244,456 L1424,478 L1408,556 L1238,532 Z" fill="#eef2f7" stroke="#94a3b8" />
          <path d="M1258,470 L1400,488" stroke="#cbd5e1" />
          <circle cx="1320" cy="588" r="16" fill="#ffffff" stroke="#b8c2cf" />
        </g>

        {/* ===== 전방 헤드 (우현, 컴팩트) ===== */}
        <g>
          <rect x="1204" y="588" width="30" height="13" rx="4" fill="#ffffff" transform="rotate(5 1219 594)" />
          <ellipse cx="1228" cy="622" rx="15" ry="19" fill="#ffffff" transform="rotate(-6 1228 622)" />
          <ellipse cx="1228" cy="623" rx="8" ry="11" stroke="#cbd5e1" transform="rotate(-6 1228 623)" />
          <rect x="1268" y="582" width="54" height="58" rx="8" fill="#eef2f7" stroke="#b8c2cf" transform="rotate(4 1295 611)" />
          <circle cx="1294" cy="608" r="13" fill="#ffffff" />
          <circle cx="1294" cy="608" r="6" stroke="#cbd5e1" />
        </g>

        {/* ===== 전방 행잉 로커 (좌현, WWW) ===== */}
        <g>
          <rect x="1206" y="162" width="60" height="132" fill="#eef2f7" stroke="#b8c2cf" />
          <Zigzag x={1210} y={186} n={5} w={5.5} h={13} />
          <Zigzag x={1210} y={238} n={5} w={5.5} h={13} />
        </g>

        {/* ===== 오너 선실: 아일랜드 베드 + 베개 + 벤치 + 화장대 ===== */}
        <g>
          <path
            d="M1318,272 L1600,318 Q1668,352 1676,425 Q1668,498 1600,532 L1318,578 Q1300,505 1300,425 Q1300,345 1318,272 Z"
            fill="#ffffff"
            stroke="#94a3b8"
          />
          <line x1="1312" y1="425" x2="1672" y2="425" stroke="#cbd5e1" />
          <path d="M1400,290 Q1428,425 1400,560" stroke="#e6ebf2" />
          {/* 베개 (뱃머리 쪽) */}
          <g fill="#f8fafc" stroke="#b8c2cf">
            <rect x="1570" y="330" width="54" height="72" rx="12" transform="rotate(14 1597 366)" />
            <rect x="1570" y="448" width="54" height="72" rx="12" transform="rotate(-14 1597 484)" />
            <path d="M1584,352 l26,28 M1584,498 l26,-28" stroke="#dbe3ec" strokeWidth={1.5} />
          </g>
          {/* 사이드 벤치 & 화장대 */}
          <rect x="1266" y="196" width="122" height="46" rx="10" fill="#eef2f7" stroke="#b8c2cf" transform="rotate(8 1327 219)" />
          <rect x="1266" y="608" width="122" height="46" rx="10" fill="#eef2f7" stroke="#b8c2cf" transform="rotate(-8 1327 631)" />
          <rect x="1430" y="566" width="112" height="46" rx="10" fill="#eef2f7" stroke="#b8c2cf" transform="rotate(-16 1486 589)" />
        </g>

        {/* ===== 뱃머리: 세일/체인 로커 + 윈들러스 ===== */}
        <g>
          <path d="M1812,354 L1898,425 L1812,496 Z" fill="#eef2f7" stroke="#b8c2cf" />
          <rect x="1826" y="410" width="26" height="30" rx="5" fill="#ffffff" stroke="#94a3b8" />
          <path d="M1856,425 l12,0 m6,0 l12,0" stroke="#94a3b8" strokeWidth={2} strokeDasharray="4 5" />
        </g>
      </g>

      {/* ---------- 포트라이트(현창) ---------- */}
      <g id="portlights" fill="#dbeafe" stroke="#94a3b8" strokeWidth={1.5} pointerEvents="none">
        {/* 좌현 (상단) */}
        <rect x="430" y="160" width="64" height="11" rx="5" transform="rotate(-3 462 165)" />
        <rect x="700" y="151" width="64" height="11" rx="5" transform="rotate(-1 732 156)" />
        <rect x="950" y="151" width="64" height="11" rx="5" transform="rotate(1 982 156)" />
        <rect x="1180" y="159" width="64" height="11" rx="5" transform="rotate(6 1212 164)" />
        <rect x="1400" y="183" width="64" height="11" rx="5" transform="rotate(12 1432 188)" />
        <rect x="1580" y="224" width="58" height="11" rx="5" transform="rotate(20 1609 229)" />
        {/* 우현 (하단) */}
        <rect x="430" y="679" width="64" height="11" rx="5" transform="rotate(3 462 684)" />
        <rect x="700" y="688" width="64" height="11" rx="5" transform="rotate(1 732 693)" />
        <rect x="950" y="688" width="64" height="11" rx="5" transform="rotate(-1 982 693)" />
        <rect x="1180" y="680" width="64" height="11" rx="5" transform="rotate(-6 1212 685)" />
        <rect x="1400" y="656" width="64" height="11" rx="5" transform="rotate(-12 1432 661)" />
        <rect x="1580" y="615" width="58" height="11" rx="5" transform="rotate(-20 1609 620)" />
      </g>
    </>
  );
}
