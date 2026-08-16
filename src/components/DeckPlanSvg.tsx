// 선박 평면(위에서 본) 도면 — Oceanis Clipper 473 원본 도면을 참고한 정밀 semantic 재작도.
// 좌표계: viewBox 0 0 2000 850, 뱃머리(bow)=오른쪽, 선미(stern)=왼쪽, 상단=좌현(port).
//
// 배치 (원본 이미지 기준):
//  - 선미 끝(x<236): 선미 격실 — 격벽으로 분리된 별도 공간
//  - 선미 좌현: 후방 선실(더블 베드+베개) / 선미 우현: 후방 창고(고정 가구 없음)
//  - 좌현 중앙: 후방 헤드(변기·세면대·샤워, 선실이 헤드 벽까지 이어짐)
//    + 차트 테이블(바우를 향해 앉음, 좌현 벽에 배전반)
//  - 중앙: 컴패니언웨이 계단(격벽에 붙음) + 계단 뒤 엔진룸(두 후방 선실 사이)
//  - 우현 중앙: 갤리(짐벌 스토브 그리드 + 더블 싱크 + 하부 로커)
//  - 살롱: U자 세틀리(좌현) + 접이식 테이블 + 세틀리(우현), 마스트
//  - 우현 전방: 항해석(차트 테이블), 컴팩트 헤드(변기·세면대·초소형 샤워실)
//  - 전방: 오너 선실(아일랜드 베드+베개, 좌현 벤치, 화장대), 뱃머리 로커
//
// 레이어: #hull / #sole(바닥 플랭크) / #zones(클릭 영역) / #bulkheads(격벽+문) / #furniture / #portlights

"use client";

import { hullTopPath } from "@/lib/hull";

type Props = {
  activeZone?: string | null;
  onZoneClick?: (zoneId: string) => void;
  /** 레이어 가시성 (키: sole/zones/bulkheads/furniture/portlights, 기본 모두 표시) */
  layers?: Record<string, boolean>;
};

const ZONES: { id: string; label: string; d: string }[] = [
  { id: "zone-stern", label: "선미 격실", d: "M236,224 L236,626 L230,624 L212,612 L196,597 L175,567 L160,537 L152,523 L152,327 L160,313 L175,283 L196,253 L212,238 L230,226 Z" },
  { id: "zone-aft-cabin-port", label: "후방 선실 (좌현)", d: "M646,156 L646,306 L556,306 L556,366 L440,366 L440,422 L240,422 L240,223 L260,209 L300,194 L350,180 L400,170 L450,164 L500,161 L556,157 Z" },
  { id: "zone-aft-cabin-stbd", label: "후방 창고 (우현)", d: "M556,450 L440,450 L440,428 L240,428 L240,627 L260,641 L300,656 L350,670 L400,680 L450,686 L500,689 L556,693 Z" },
  { id: "zone-engine-room", label: "엔진룸", d: "M440,366 L556,366 L556,450 L440,450 Z" },
  { id: "zone-aft-head", label: "후방 헤드 (좌현)", d: "M650,156 L808,156 L808,308 L650,308 Z" },
  { id: "zone-chart", label: "차트 테이블 (좌현)", d: "M814,156 L903,156 L903,308 L814,308 Z" },
  { id: "zone-companionway", label: "컴패니언웨이", d: "M560,312 L903,312 L903,468 L560,468 Z" },
  { id: "zone-galley", label: "갤리 (우현)", d: "M560,472 L868,472 L868,694 L560,694 Z" },
  { id: "zone-saloon", label: "살롱", d: "M907,156 L1014,161 L1100,166 L1200,175 L1228,178 L1228,672 L1200,675 L1100,684 L1014,689 L868,694 L868,472 L907,472 Z" },
  { id: "zone-nav", label: "항해석 (우현)", d: "M1240,452 L1324,460 L1316,534 L1236,528 Z" },
  { id: "zone-fwd-head", label: "전방 헤드 (우현)", d: "M1186,544 L1330,556 L1322,664 L1194,652 Z" },
  { id: "zone-owner-cabin", label: "오너 선실 (전방)", d: "M1232,179 L1300,186 L1400,202 L1500,223 L1600,252 L1700,290 L1750,312 L1786,332 L1786,518 L1750,538 L1700,560 L1600,598 L1500,627 L1400,648 L1300,664 L1232,671 Z" },
  { id: "zone-bow", label: "뱃머리 로커", d: "M1798,339 L1850,370 L1880,389 L1900,404 L1920,419 L1928,425 L1920,431 L1900,446 L1880,461 L1850,480 L1798,511 Z" },
];

export default function DeckPlanSvg({ activeZone, onZoneClick, layers }: Props) {
  const on = (k: string) => layers?.[k] !== false;
  return (
    <>
      <defs>
        {/* 캐빈 솔(바닥) 플랭크 라인 */}
        <pattern id="sole" width="16" height="11" patternUnits="userSpaceOnUse">
          <line x1="0" y1="5" x2="16" y2="5" stroke="#e6ebf2" strokeWidth="1.5" />
        </pattern>
      </defs>

      {/* ---------- 선체 (data/hull.json 에서 생성 — 측면/3D 와 단일 소스) ---------- */}
      <g id="hull">
        <path d={hullTopPath(0)} fill="#f8fafc" stroke="#334155" strokeWidth={5} />
        {/* 데크 안쪽 라인 */}
        <path d={hullTopPath(0.18)} fill="none" stroke="#cbd5e1" strokeWidth={2} />
      </g>

      {/* ---------- 바닥(솔) 플랭크 ---------- */}
      {on("sole") && (
      <g id="sole">
        <rect x="656" y="316" width="246" height="148" fill="url(#sole)" />
        <rect x="912" y="352" width="300" height="168" fill="url(#sole)" />
        <rect x="1238" y="298" width="60" height="256" fill="url(#sole)" />
        <rect x="250" y="480" width="280" height="150" fill="url(#sole)" />
      </g>

      )}

      {/* ---------- 클릭 가능한 구역 ---------- */}
      {on("zones") && (
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

      )}

      {/* ---------- 격벽 + 문(스윙 아크) ---------- */}
      {on("bulkheads") && (
      <g id="bulkheads" stroke="#475569" strokeWidth={3} strokeLinecap="round" fill="none">
        {/* 선미 격실 격벽 — 선미 끝은 별도 공간 */}
        <line x1="236" y1="224" x2="236" y2="626" strokeWidth={2.5} />
        {/* 후방 선실 전방 격벽 — 문은 계단 양옆, 상부(y<310)는 선실이 x=650 헤드 벽까지 이어짐 */}
        <line x1="560" y1="366" x2="560" y2="450" />
        <line x1="560" y1="506" x2="560" y2="698" />
        {/* 엔진룸 벽 (계단 뒤, 두 후방 선실 사이) */}
        <path d="M560,366 L444,366 L444,450 L560,450" strokeWidth={2.5} />
        {/* 후방 헤드 벽 — 좌측 벽(x=650)이 변기 바로 옆이자 후방 선실과의 격벽 */}
        <line x1="650" y1="152" x2="650" y2="310" />
        <line x1="810" y1="152" x2="810" y2="310" />
        <line x1="560" y1="310" x2="726" y2="310" />
        <line x1="786" y1="310" x2="810" y2="310" />
        {/* 살롱/오너 격벽 (x=1230) — 문은 좌현 세틀리 바로 앞, 폭 32 소형 */}
        <line x1="1230" y1="176" x2="1230" y2="350" />
        <line x1="1230" y1="382" x2="1230" y2="545" />
        {/* 전방 헤드 벽 — 왼쪽(선미 쪽)에도 격벽 */}
        <path d="M1188,545 L1240,550 M1284,554 L1330,558 M1330,558 L1322,660 M1188,545 L1196,654" />
        {/* 뱃머리 수밀 격벽 */}
        <path d="M1794,336 Q1814,425 1794,514" strokeWidth={2.5} />
        {/* 문 스윙 아크 */}
        <g stroke="#94a3b8" strokeWidth={1.5}>
          <path d="M560,310 A56,56 0 0 1 504,366" />
          <path d="M560,506 A56,56 0 0 0 504,450" />
          <path d="M726,310 A60,60 0 0 0 786,370" />
          <path d="M1230,350 A32,32 0 0 1 1262,382" />
          <path d="M1240,550 A44,44 0 0 1 1284,594" />
        </g>
      </g>

      )}

      {/* ---------- 가구/장식 (비상호작용) ---------- */}
      {on("furniture") && (
      <g id="furniture" fill="none" stroke="#94a3b8" strokeWidth={2} pointerEvents="none">
        {/* ===== 후방 선실 (좌현): 더블 베드 + 베개 ===== */}
        <g>
          {/* 선미 쪽 상단 코너는 좁아진 선체를 따라 챔퍼 — 선미 격실(x<236) 침범 금지 */}
          <path d="M300,196 L518,196 Q532,196 532,210 L532,332 Q532,346 518,346 L258,346 Q244,346 244,332 L244,262 Z" fill="#ffffff" />
          <line x1="248" y1="271" x2="528" y2="271" stroke="#cbd5e1" />
          {/* 이불 주름 */}
          <path d="M330,198 Q368,271 330,344" stroke="#dbe3ec" />
          <path d="M358,198 Q392,271 358,344" stroke="#e6ebf2" />
          {/* 베개 (선미 쪽) */}
          <g fill="#f8fafc" stroke="#b8c2cf">
            <rect x="264" y="238" width="58" height="50" rx="12" transform="rotate(-7 293 263)" />
            <rect x="264" y="294" width="58" height="50" rx="12" transform="rotate(6 293 319)" />
            <path d="M278,252 l28,22 M278,310 l28,20" stroke="#dbe3ec" strokeWidth={1.5} />
          </g>
          {/* 풋 로커 */}
          <rect x="244" y="366" width="118" height="50" rx="8" fill="#eef2f7" stroke="#b8c2cf" />
        </g>

        {/* ===== 후방 격실 (우현): 선실이 아니라 창고 — 고정 가구가 없어 비워 둔다.
             그려 넣은 세일백·선반은 실제로 없는 물건이라 제거했다. ===== */}

        {/* ===== 후방 좌현: 헤드(650~810) + 차트 테이블(814~903) — 650 이전은 후방 선실 ===== */}
        <g>
          {/* 변기 — 좌측 벽 바로 옆 (왼쪽 여유 공간 없음) */}
          <rect x="662" y="156" width="38" height="15" rx="4" fill="#ffffff" />
          <ellipse cx="681" cy="196" rx="17" ry="22" fill="#ffffff" />
          <ellipse cx="681" cy="198" rx="10" ry="14" stroke="#cbd5e1" />
          {/* 세면대 카운터 */}
          <rect x="726" y="152" width="78" height="76" rx="10" fill="#eef2f7" />
          <circle cx="765" cy="190" r="17" fill="#ffffff" />
          <circle cx="765" cy="190" r="8" stroke="#cbd5e1" />
          <circle cx="765" cy="167" r="3" fill="#94a3b8" />
          {/* 샤워 (헤드 하부) */}
          <circle cx="676" cy="278" r="6" stroke="#b8c2cf" />
          <path d="M668,266 l-8,-10 M676,264 v-13 M684,266 l8,-10" stroke="#b8c2cf" strokeWidth={1.5} />
        </g>

        {/* ===== 차트 테이블 (헤드 우측) — 바우를 향해 앉는 배치, 좌현 벽엔 배전반 ===== */}
        <g>
          {/* 배전반 (서킷 브레이커) — 좌현 벽면 */}
          <rect x="820" y="158" width="76" height="20" rx="3" fill="#ffffff" stroke="#64748b" />
          <path d="M830,163 v10 M842,163 v10 M854,163 v10 M866,163 v10 M878,163 v10 M888,163 v10" stroke="#94a3b8" strokeWidth={2} />
          {/* 책상은 바우 쪽 — 항해사가 선미 쪽 스툴에 앉아 바우를 본다 */}
          <rect x="846" y="188" width="52" height="104" rx="6" fill="#eef2f7" stroke="#94a3b8" />
          <rect x="854" y="196" width="36" height="66" rx="4" stroke="#cbd5e1" />
          <line x1="854" y1="274" x2="890" y2="274" stroke="#cbd5e1" />
          <circle cx="824" cy="240" r="14" fill="#ffffff" stroke="#b8c2cf" />
        </g>

        {/* ===== 컴패니언웨이: 계단(격벽에 붙음, 선미 콕핏으로 올라감) + 계단 뒤 엔진 ===== */}
        <g>
          <rect x="564" y="368" width="84" height="80" rx="3" fill="#ffffff" stroke="#64748b" />
          <line x1="585" y1="368" x2="585" y2="448" stroke="#64748b" />
          <line x1="606" y1="368" x2="606" y2="448" stroke="#64748b" />
          <line x1="627" y1="368" x2="627" y2="448" stroke="#64748b" />
          {/* 오르는 방향 (선미 쪽) */}
          <path d="M652,408 h-44 m10,-7 l-10,7 l10,7" stroke="#94a3b8" strokeWidth={1.5} />
          {/* 엔진 (계단 뒤 기관실) — 블록 + 리브 + 플라이휠, 샤프트는 선미로 */}
          <rect x="460" y="378" width="62" height="60" rx="5" fill="#ffffff" stroke="#64748b" />
          <line x1="476" y1="378" x2="476" y2="438" stroke="#94a3b8" />
          <line x1="492" y1="378" x2="492" y2="438" stroke="#94a3b8" />
          <line x1="508" y1="378" x2="508" y2="438" stroke="#94a3b8" />
          <circle cx="536" cy="408" r="9" fill="#ffffff" stroke="#64748b" />
          <line x1="460" y1="408" x2="446" y2="408" stroke="#64748b" strokeDasharray="3 3" />
        </g>

        {/* ===== 갤리 (우현): 계단까지 한 판으로 이어지는 조리대(화구+싱크) + 하부 로커 일렬 ===== */}
        <g>
          {/* 조리대 — ㄴ 좌우반전 한 판: 세로팔(소파 왼쪽에 맞닿음, x796~866) +
              가로팔(선체 쪽 y606~670, 후방 격벽 x=564까지 여백 없이).
              세로팔은 가운데 싱크, 위아래는 빈 조리 공간 */}
          <path
            d="M804,478 L858,478 Q866,478 866,486 L866,662 Q866,670 858,670 L572,670 Q564,670 564,662 L564,614 Q564,606 572,606 L788,606 Q796,606 796,598 L796,486 Q796,478 804,478 Z"
            fill="#eef2f7"
            stroke="#b8c2cf"
          />
          {/* 더블 싱크 (세로팔 가운데) */}
          <rect x="804" y="528" width="54" height="40" rx="7" fill="#ffffff" stroke="#b8c2cf" />
          <rect x="804" y="572" width="54" height="40" rx="7" fill="#ffffff" stroke="#b8c2cf" />
          <circle cx="831" cy="521" r="4" fill="#94a3b8" />
          {/* 가스레인지 — 스타보드 벽면 중앙, 조그맣게 (2구) */}
          <rect x="640" y="614" width="72" height="44" rx="4" fill="#ffffff" stroke="#64748b" />
          <circle cx="658" cy="636" r="10" stroke="#94a3b8" />
          <circle cx="694" cy="636" r="10" stroke="#94a3b8" />
          <circle cx="658" cy="636" r="4" stroke="#cbd5e1" />
          <circle cx="694" cy="636" r="4" stroke="#cbd5e1" />
        </g>

        {/* ===== 살롱: U 세틀리(좌현) + 테이블 + 세틀리(우현) + 마스트 ===== */}
        <g>
          {/* 좌현 세틀리: 등받이 + 좌석 + 양팔 — 오너 격벽(x=1230)을 넘지 않게 */}
          <rect x="920" y="212" width="296" height="52" rx="14" fill="#eef2f7" stroke="#b8c2cf" />
          <rect x="918" y="212" width="48" height="132" rx="12" fill="#eef2f7" stroke="#b8c2cf" />
          <rect x="1178" y="212" width="48" height="132" rx="12" fill="#eef2f7" stroke="#b8c2cf" />
          <rect x="972" y="266" width="200" height="70" rx="12" fill="#ffffff" />
          <line x1="1042" y1="266" x2="1042" y2="336" stroke="#cbd5e1" />
          <line x1="1112" y1="266" x2="1112" y2="336" stroke="#cbd5e1" />
          <path d="M1002,296 h10 M1007,291 v10 M1072,296 h10 M1077,291 v10 M1146,296 h10 M1151,291 v10" stroke="#94a3b8" strokeWidth={1.5} />
          {/* (복도 길목의 접이식 테이블은 실물에 없어 제거) */}
          {/* 우현 세틀리 — 도넛형 벤치(등받이 없음): 가운데 테이블 둘레를 빙 둘러앉는 구조.
              각지지 않게, 선체 쪽(아래)은 큰 라운드 */}
          <path
            fillRule="evenodd"
            d="M868,506 L1184,506 L1184,566 Q1184,634 1116,634 L936,634 Q868,634 868,566 Z
               M920,538 h212 q16,0 16,16 v12 q0,32 -32,32 h-180 q-32,0 -32,-32 v-12 q0,-16 16,-16 z"
            fill="#eef2f7"
            stroke="#b8c2cf"
          />
          <path d="M985,522 h10 M990,517 v10 M1085,522 h10 M1090,517 v10" stroke="#94a3b8" strokeWidth={1.5} />
          {/* 가운데 테이블 (모서리 둥근 사각) */}
          <rect x="978" y="546" width="96" height="44" rx="10" fill="#e2e8f0" stroke="#94a3b8" />
          <rect x="986" y="553" width="80" height="30" rx="7" fill="none" stroke="#cbd5e1" />
          {/* 마스트/컴프레션 포스트 */}
          <ellipse cx="1202" cy="425" rx="10" ry="7" fill="#cbd5e1" stroke="#64748b" />
        </g>

        {/* ===== 항해석 (우현): 차트 테이블 — 헤드 벽(y≈545+)을 넘지 않게 ===== */}
        <g>
          <path d="M1244,456 L1318,464 L1310,530 L1240,512 Z" fill="#eef2f7" stroke="#94a3b8" />
          <path d="M1256,468 L1302,474" stroke="#cbd5e1" />
        </g>

        {/* ===== 전방 헤드 (우현, 컴팩트): 변기 + 세면대 + 초소형 샤워실 ===== */}
        <g>
          <rect x="1204" y="588" width="30" height="13" rx="4" fill="#ffffff" transform="rotate(5 1219 594)" />
          <ellipse cx="1228" cy="622" rx="15" ry="19" fill="#ffffff" transform="rotate(-6 1228 622)" />
          <ellipse cx="1228" cy="623" rx="8" ry="11" stroke="#cbd5e1" transform="rotate(-6 1228 623)" />
          {/* 세면대 */}
          <rect x="1250" y="564" width="54" height="50" rx="8" fill="#eef2f7" stroke="#b8c2cf" transform="rotate(4 1277 589)" />
          <circle cx="1277" cy="589" r="12" fill="#ffffff" />
          <circle cx="1277" cy="589" r="6" stroke="#cbd5e1" />
          {/* 샤워실 (초소형) */}
          <rect x="1268" y="620" width="46" height="40" rx="6" fill="#ffffff" stroke="#94a3b8" />
          <circle cx="1291" cy="648" r="5" stroke="#b8c2cf" />
          <path d="M1283,638 l-7,-9 M1291,636 v-11 M1299,638 l7,-9" stroke="#b8c2cf" strokeWidth={1.5} />
        </g>

        {/* ===== 오너 선실: 아일랜드 베드 + 베개 + 벤치 + 화장대 ===== */}
        <g>
          <path
            d="M1342,278 L1600,318 Q1668,352 1676,425 Q1668,498 1600,532 L1342,570 Q1326,500 1326,425 Q1326,350 1342,278 Z"
            fill="#ffffff"
            stroke="#94a3b8"
          />
          <line x1="1334" y1="425" x2="1672" y2="425" stroke="#cbd5e1" />
          <path d="M1400,290 Q1428,425 1400,560" stroke="#e6ebf2" />
          {/* 베개 (뱃머리 쪽) */}
          <g fill="#f8fafc" stroke="#b8c2cf">
            <rect x="1570" y="330" width="54" height="72" rx="12" transform="rotate(14 1597 366)" />
            <rect x="1570" y="448" width="54" height="72" rx="12" transform="rotate(-14 1597 484)" />
            <path d="M1584,352 l26,28 M1584,498 l26,-28" stroke="#dbe3ec" strokeWidth={1.5} />
          </g>
          {/* 사이드 벤치(좌현) & 화장대 — 우현 벤치는 헤드/세면대와 겹쳐 제거 */}
          <rect x="1266" y="196" width="122" height="46" rx="10" fill="#eef2f7" stroke="#b8c2cf" transform="rotate(8 1327 219)" />
          <rect x="1438" y="578" width="112" height="44" rx="10" fill="#eef2f7" stroke="#b8c2cf" transform="rotate(-16 1494 600)" />
        </g>

        {/* ===== 뱃머리: 세일/체인 로커 + 윈들러스 ===== */}
        <g>
          <path d="M1812,354 L1898,425 L1812,496 Z" fill="#eef2f7" stroke="#b8c2cf" />
          <rect x="1826" y="410" width="26" height="30" rx="5" fill="#ffffff" stroke="#94a3b8" />
          <path d="M1856,425 l12,0 m6,0 l12,0" stroke="#94a3b8" strokeWidth={2} strokeDasharray="4 5" />
        </g>
      </g>

      )}

      {/* ---------- 포트라이트(현창) ---------- */}
      {on("portlights") && (
      <g id="portlights" fill="#dbeafe" stroke="#94a3b8" strokeWidth={1.5} pointerEvents="none">
        {/* 좌현 (상단) — 선체선 안쪽 9px, 국소 기울기 정렬 */}
        <rect x="430" y="161" width="64" height="11" rx="5" transform="rotate(-4 462 166)" />
        <rect x="700" y="152" width="64" height="11" rx="5" transform="rotate(0 732 157)" />
        <rect x="950" y="157" width="64" height="11" rx="5" transform="rotate(3 982 162)" />
        <rect x="1180" y="174" width="64" height="11" rx="5" transform="rotate(6 1212 179)" />
        <rect x="1400" y="205" width="64" height="11" rx="5" transform="rotate(12 1432 210)" />
        <rect x="1580" y="252" width="58" height="11" rx="5" transform="rotate(18 1609 257)" />
        {/* 우현 (하단) */}
        <rect x="430" y="678" width="64" height="11" rx="5" transform="rotate(4 462 683)" />
        <rect x="700" y="687" width="64" height="11" rx="5" transform="rotate(0 732 692)" />
        <rect x="950" y="682" width="64" height="11" rx="5" transform="rotate(-3 982 687)" />
        <rect x="1180" y="665" width="64" height="11" rx="5" transform="rotate(-6 1212 670)" />
        <rect x="1400" y="634" width="64" height="11" rx="5" transform="rotate(-12 1432 639)" />
        <rect x="1580" y="587" width="58" height="11" rx="5" transform="rotate(-18 1609 592)" />
      </g>
      )}
    </>
  );
}
