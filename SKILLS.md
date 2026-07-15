# SKILLS.md — AI 에이전트용 기능 명세

Oceanis Clipper 473 유지보수 디스플레이의 모든 기능은 **모듈화된 REST API + JSON 파일 저장**으로
구성되어 있어, AI 에이전트가 이 문서만 보고 조회·생성·수정·삭제를 수행할 수 있다.

## 0. 공통

- Base URL: `http://localhost:3000` (dev)
- **인증**: 모든 라우트는 세션 쿠키 필요 (미들웨어 보호). 로그인: `POST /api/auth/callback/credentials`
  (브라우저 로그인 페이지 `/login` 사용 권장). 역할: `admin` | `crew`. `(admin)` 표시는 관리자 전용.
- **좌표계 (2D)**: SVG viewBox `0 0 2000 850`. **선수(bow)=오른쪽(x=2000쪽), 선미=왼쪽, 상단=좌현(port)**.
  좌현 측면 뷰는 표시할 때만 미러(뱃머리 왼쪽) — 저장은 항상 정규 좌표.
- **좌표계 (3D)**: `X=(x-1000)/100`(종방향, 선수+), `Y=(470-sideY)/100`(수직, 수선=0),
  `Z=(y-425)*0.0085`(횡방향, 우현+). 구현: `src/lib/three/coords.ts` `toWorld()`.
- 저장 파일: `data/*.json` (서버가 관리, 직접 수정보다 API 사용 권장).

## 1. 장비 (Devices) — `data/devices.json`

도면 위 관리 대상 장비. 실제 전자장비 배치도(2025.10.08) 39개가 1:1로 등록되어 있다.

| 동작 | 요청 |
|---|---|
| 목록 | `GET /api/devices` |
| 생성 | `POST /api/devices` `{name, category, position:{x,y}, sideY?, sensorId?, config?, notes?}` |
| 수정 | `PUT /api/devices` `{id, ...patch}` |
| 삭제 | `DELETE /api/devices?id=<id>` |

- `category`: `engine|fuel|water|waste|electrical|charging|navigation|comms|safety|bilge|seacock|other`
- `position` = 평면 좌표, `sideY` = 측면 수직 좌표(솔≈500, 빌지≈560, 데크≈300)
- `sensorId` 는 텔레메트리 바인딩 키 (없으면 offline 표시)

## 2. 텔레메트리 (실시간 상태)

- `GET /api/telemetry` — **SSE 스트림**. 이벤트 `telemetry`: `{source, readings:[{sensorId, status, values, ts}]}`
- `status`: `ok|warning|alert|offline`. 2초 주기.
- 센서 소스 교체 지점: `src/lib/sensors/` (`SensorSource` 인터페이스, env `SENSOR_SOURCE`)

## 3. 사용자 도형 (Shapes, 2D 그리기 + 3D 압출) — `data/shapes.json`

편집 도구로 그린 커스텀 에셋. **top 뷰 도형은 3D 뷰에서 자동 압출**된다.

| 동작 | 요청 |
|---|---|
| 목록 | `GET /api/shapes` |
| 생성 | `POST /api/shapes` (아래 스키마) |
| 수정 | `PUT /api/shapes` `{id, ...patch}` |
| 삭제 | `DELETE /api/shapes?id=<id>` |

스키마:
```jsonc
{
  "view": "top" | "port" | "starboard",   // 어느 뷰의 도형인지
  "kind": "rect" | "ellipse" | "line" | "polygon" | "path",
  "name": "발전기",                        // 선택
  // rect: x,y(좌상단),w,h · ellipse: cx,cy,rx,ry · line/polygon/path: points:[{x,y},...]
  "x": 700, "y": 400, "w": 120, "h": 80,
  "style": { "stroke": "#475569", "strokeWidth": 3, "fill": "#e2e8f0", "fillOpacity": 0.6, "dash": false },
  // ---- 3D 압출 (top 뷰만 의미) ----
  "show3d": true,        // 3D 표시 여부
  "height3d": 0.5,       // 압출 높이(m)
  "elevation3d": -0.3    // 바닥 고도(m): 수선=0, 솔≈-0.3, 데크≈1.0
}
```
- style 생략 시 기본값 병합. 3D 변환: rect→box, ellipse→cylinder, line→얇은 벽, polygon/path→Extrude.

## 4. 도면 레이어 (기존 평면도/측면도/3D 지우기·편집) — `data/plan-layers.json`

내장 도면 구성 요소의 가시성. 끄면 해당 부분이 도면에서 지워진 것처럼 표시된다 (사용자 도형으로 대체 드로잉 가능).

| 동작 | 요청 |
|---|---|
| 조회 | `GET /api/plan-layers` |
| 수정 | `PUT /api/plan-layers` `{"top": {"furniture": false}}` (부분 병합) |

- `top`: `sole`(바닥) `zones`(구역) `bulkheads`(격벽·문) `furniture`(가구) `portlights`(현창)
- `side`: `rigging` `deck` `interior` `labels`
- `three`: `exterior` `interior` `water`

## 5. 프로시저 (체크리스트 + 감사 기록)

템플릿: `data/procedures.json` · 실행 로그: `data/procedure-runs.json` (gitignore)

| 동작 | 요청 |
|---|---|
| 템플릿 목록 | `GET /api/procedures` |
| 템플릿 생성 (admin) | `POST /api/procedures` `{title, category?, icon?, color?, items:[{label, detail?, deviceId?, required?}]}` |
| 템플릿 수정/삭제 (admin) | `PUT /api/procedures/<id>` · `DELETE /api/procedures/<id>` |
| 실행 목록 | `GET /api/procedures/runs` |
| 실행 시작 | `POST /api/procedures/runs` `{templateId}` |
| 항목 상태 | `PATCH /api/procedures/runs/<id>` `{action:"status", itemId, status:"pending"|"ok"|"problem"|"none"}` |
| 메모 | `PATCH …` `{action:"note", itemId, note}` |
| 완료 | `PATCH …` `{action:"complete"}` |
| 실행 삭제 (admin) | `DELETE /api/procedures/runs/<id>` |

- 체크 상태: `pending`(노랑, 점검 중 — 선점 1회, 남이 덮어쓸 수 없음) → `ok`(초록)/`problem`(빨강).
  `none` 되돌리기는 기록 소유자/관리자만. 체크·완료의 사용자·시각은 **서버가 세션에서 기록**.

## 6. 푸시 알림 (Pushover)

| 동작 | 요청 |
|---|---|
| 상태 (admin) | `GET /api/notify/test` → `{channel, configured, recipientCount, monitor}` |
| 테스트 발송 (admin) | `POST /api/notify/test` `{title?, message?, priority?: "low"|"normal"|"high"|"emergency"}` |
| 수신자 목록/추가/토글/삭제 (admin) | `GET|POST|PUT|DELETE /api/notify/recipients` (POST: `{label, userKey}`) |

- emergency = 사이렌 + 확인까지 반복. 자동 경고 모니터: env `ALERT_MONITOR=on` (상태 전이 시만 발송).
- 채널 교체 지점: `src/lib/notifications/` (`NotificationChannel` 인터페이스)

## 7. 사용자 (크루 계정)

| 동작 | 요청 |
|---|---|
| 목록/생성/삭제 (admin) | `GET|POST|DELETE /api/users` (POST: `{email, name, role, password}`) |

## 8. 코드 확장 지점 (모듈 경계)

| 모듈 | 파일 | 교체/확장 |
|---|---|---|
| 센서 소스 | `src/lib/sensors/` | CAN/zigbee 구현 추가 → env 스위치 |
| 알림 채널 | `src/lib/notifications/` | WebPush/FCM/SMS 추가 |
| 저장소 | `src/lib/*/registry.ts` | JSON → SQLite/Prisma 교체 (인터페이스 유지) |
| 2D 도면 | `src/components/DeckPlanSvg.tsx`, `DeckPlanSideSvg.tsx` | 레이어 단위 편집 |
| 3D 씬 | `src/components/three/Scene3D.tsx` | 선체 로프트/가구/도형 압출 |

## 9. 에이전트 사용 예시

"엔진룸 옆에 발전기 박스를 그리고 3D에서 60cm 높이로 보여줘":
```
POST /api/shapes
{"view":"top","kind":"rect","name":"발전기","x":830,"y":440,"w":90,"h":70,
 "style":{"fill":"#f59e0b"},"height3d":0.6,"elevation3d":-0.3}
```

"평면도에서 가구를 숨겨줘": `PUT /api/plan-layers {"top":{"furniture":false}}`

"출항 전 점검 시작하고 날씨 항목을 정상 처리": 
`POST /api/procedures/runs {"templateId":"board-dock"}` →
`PATCH /api/procedures/runs/<runId> {"action":"status","itemId":"bd-1","status":"ok"}`
