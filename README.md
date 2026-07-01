# ⛵ 선박 유지보수 디스플레이 (Boat Maintenance Display)

Beneteau Oceanis Clipper 473 기준. 선내 기기·부품의 **위치를 도면 위에 직접 표시**하고,
센서 상태를 실시간으로 보여주는 관리 디스플레이. Next.js(서버 포함) 기반.

## 주요 기능 (현재)

- **2D 평면 도면** — semantic SVG(선체/구역/가구 레이어, 각 요소 `id` 부여), 편집 가능.
- **라벨 오버레이** — 레퍼런스처럼 리더 라인 + 라벨을 도면 위 상/하단 여백에 자동 배치.
- **데이터 기반 디바이스 레지스트리** — 부품은 코드가 아닌 `data/devices.json`. 편집 모드에서 도면 클릭으로 추가·배치·삭제.
- **센서 파이프라인** — `SensorSource` 인터페이스 뒤 Mock 소스 + SSE 실시간 스트림. (엔진/탱크/전기/충전/항해/통신/안전/빌지/시콕크 등)
- **인증** — Auth.js(Credentials + JWT), bcrypt. 관리자/크루 역할. 관리자가 크루 명단을 생성·관리(`/admin/users`). 감사 추적(프로토콜 모드)의 기반.

## 시작하기

```bash
cp .env.example .env.local   # AUTH_SECRET 등 설정 (openssl rand -base64 33)
npm install
npm run dev                  # http://localhost:3000
```

초기 관리자: `.env.local` 의 `AUTH_ADMIN_EMAIL` / `AUTH_ADMIN_PASSWORD` (기본 admin@boat.local / admin1234).
첫 실행 시 관리자 계정이 없으면 자동 생성됩니다.

## 아키텍처

| 계층 | 위치 | 교체 지점 |
|---|---|---|
| 도면(SVG) | `src/components/DeckPlanSvg.tsx` | — |
| 디바이스 레지스트리 | `src/lib/devices/registry.ts` (JSON) | → SQLite/Prisma |
| 센서 소스 | `src/lib/sensors/` (`SensorSource`) | → CAN/zigbee 구현 후 `SENSOR_SOURCE` env |
| 사용자 | `src/lib/users/registry.ts` (JSON) | → DB |
| 인증 | `src/auth.ts` / `src/auth.config.ts` / `src/middleware.ts` | — |

## 로드맵

1. ✅ 2D 도면 + 라벨 + 디바이스/센서 + 인증
2. **프로토콜 모드** — 항해 전/중/후 체크리스트, 누가 언제 체크했는지 감사 기록
3. **실통신** — CAN / zigbee `SensorSource` 구현
4. **3D 해부도** — 같은 디바이스 레지스트리를 3D 좌표로 확장

## 참고

- `data/users.json`, `.env.local` 은 커밋되지 않습니다(비밀번호 해시/시크릿 보호).
