// 기존 2D 도면(베지어)을 샘플링해 단일 소스 선체 데이터(data/hull.json)를 생성한다.
// 단위: 미터 (125 px = 1 m, x=0 은 viewBox x=1000, y=0 은 수선 470 / 평면 중심선 425)
// 실행: node scripts/gen-hull.mjs
import { writeFileSync } from "fs";

const PX = 125;
const mx = (px) => (px - 1000) / PX; // 종방향
const mzTop = (px) => (px - 425) / PX; // 평면 횡방향
const myWL = (px) => (470 - px) / PX; // 측면 수직 (수선=0)

// 3차 베지어 체인 샘플러
function sampleChain(start, segs, n = 600) {
  const pts = [];
  let p0 = start;
  for (const [c1, c2, p3] of segs) {
    for (let i = 0; i <= n; i++) {
      const t = i / n, u = 1 - t;
      pts.push({
        x: u*u*u*p0[0] + 3*u*u*t*c1[0] + 3*u*t*t*c2[0] + t*t*t*p3[0],
        y: u*u*u*p0[1] + 3*u*u*t*c1[1] + 3*u*t*t*c2[1] + t*t*t*p3[1],
      });
    }
    p0 = p3;
  }
  return pts;
}
const lerpAt = (pts, x) => {
  // pts 는 x 단조 가정 (오름/내림 모두 허용)
  let best = null, bestD = 1e9;
  for (const p of pts) { const d = Math.abs(p.x - x); if (d < bestD) { bestD = d; best = p; } }
  return best.y;
};

/* ---- 평면 외곽 (DeckPlanSvg hull) ---- */
const topUpper = sampleChain([160,315], [
  [[178,215],[300,162],[520,152]],
  [[840,142],[1120,150],[1380,192]],
  [[1620,230],[1800,315],[1935,425]],
]);
const topLower = sampleChain([1935,425], [
  [[1800,535],[1620,620],[1380,658]],
  [[1120,700],[840,708],[520,698]],
  [[300,688],[178,635],[160,535]],
]);

/* ---- 측면 프로파일 (DeckPlanSideSvg hull) ---- */
const sheer = sampleChain([175,320], [
  [[600,295],[1200,275],[1660,262]],
  [[1790,258],[1885,268],[1932,286]],
]);
const bottom = sampleChain([1900,468], [
  [[1650,542],[1350,568],[1050,574]],
  [[800,578],[550,560],[380,535]],
  [[300,523],[250,510],[232,498]],
]);

/* ---- 스테이션 그리드 (m) ---- */
// 끝단(선수/선미)을 촘촘히 — 스플라인 오버슈트 방지
const XS = [
  -6.78,-6.7,-6.55,-6.35,-6.0,-5.4,-4.6,-3.6,-2.6,-1.6,-0.6,
  0.4,1.4,2.4,3.4,4.4,5.2,6.0,6.6,7.0,7.25,7.4,7.46,
];
const clamp = (v,a,b)=>Math.min(b,Math.max(a,v));

const stations = XS.map((x) => {
  const px = 1000 + x * PX;
  const hbT = Math.abs(mzTop(lerpAt(topUpper, clamp(px,160,1935))));
  const hbB = Math.abs(mzTop(lerpAt(topLower, clamp(px,160,1935))));
  const hb = Math.max(0.02, (hbT + hbB) / 2);
  const sh = myWL(lerpAt(sheer, clamp(px,175,1932)));
  const bt = myWL(lerpAt(bottom, clamp(px,232,1900)));
  const r = (v)=>Math.round(v*1000)/1000;
  return { x: r(x), hb: r(hb), sheer: r(sh), bottom: r(Math.min(bt, -0.02)) };
});

/* ---- 부가물: 킬/러더 측면 프로파일 (m) ---- */
const keel = {
  // 기존 측면 도면 수치 기반
  profile: [
    { x: mx(870), y: myWL(568) },
    { x: mx(895), y: myWL(752) },
    { x: mx(918), y: myWL(756) },
    { x: mx(1018), y: myWL(750) },
    { x: mx(1045), y: myWL(690) },
    { x: mx(1058), y: myWL(562) },
  ].map(p=>({x:Math.round(p.x*1000)/1000,y:Math.round(p.y*1000)/1000})),
  thickness: 0.26,
};
const rudder = {
  profile: [
    { x: mx(332), y: myWL(528) },
    { x: mx(336), y: myWL(676) },
    { x: mx(356), y: myWL(698) },
    { x: mx(394), y: myWL(688) },
    { x: mx(399), y: myWL(600) },
    { x: mx(396), y: myWL(532) },
  ].map(p=>({x:Math.round(p.x*1000)/1000,y:Math.round(p.y*1000)/1000})),
  thickness: 0.1,
};

const hull = {
  meta: {
    boat: "Beneteau Oceanis Clipper 473",
    units: "m",
    pxPerM: PX,
    note: "2D 도면(실측 캘리브레이션)에서 샘플링. 평면/측면/3D가 모두 이 데이터에서 생성됨.",
  },
  sternX: mx(144),
  bowX: mx(1935),
  mastX: Math.round(mx(1202)*1000)/1000,
  stations,
  keel,
  rudder,
};

writeFileSync("data/hull.json", JSON.stringify(hull, null, 2) + "\n");
console.log("stations:", stations.length);
console.table(stations.slice(0, 6));
console.log("... bow:", stations[stations.length-1]);
console.log("sternX", hull.sternX, "bowX", hull.bowX, "length", (hull.bowX-hull.sternX).toFixed(2), "m");
