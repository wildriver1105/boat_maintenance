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

## LightHouse 4 / Tauri Android PoC

이 저장소의 Tauri 앱은 Next.js를 APK 안에서 실행하지 않습니다. Mac mini에서 실행되는
Next.js 서버를 Axiom의 전체 화면 WebView로 여는 얇은 클라이언트입니다.
대상 장비는 1세대 Axiom 9의 800×480 WVGA 화면을 기준으로 설정했습니다.

현재 테스트 서버 주소는 `src-tauri/tauri.conf.json`의
`build.frontendDist`에 있는 `http://192.168.50.10:3000`입니다. APK를 빌드하기 전에
Mac mini의 선내 LAN 고정 IP로 변경하세요.

Android 빌드 환경:

```bash
export JAVA_HOME="/Applications/Android Studio.app/Contents/jbr/Contents/Home"
export ANDROID_HOME="$HOME/Library/Android/sdk"
export NDK_HOME="$ANDROID_HOME/ndk/29.0.14206865"
```

Mac mini에서 서버를 선내 LAN에 공개:

```bash
npm run dev:lan
# 운영 빌드라면:
npm run build
npm run start:lan
```

개발 장치에서 실행하거나 테스트용 APK 생성:

```bash
npm run tauri:android:dev
npm run tauri:android:apk:test
```

테스트용 APK는 디버그 키로 서명되며 SD 카드 설치 PoC에 적합합니다. 실제 배포용
`npm run tauri:android:apk`는 별도의 영구 서명 키 설정이 필요합니다. 설치 전에
`http://<Mac-mini-IP>:3000/api/health`가 같은 선내 네트워크의 다른 장치에서 열리는지
확인하세요. APK는 Axiom CPU를 아직 모르는 상태를 고려해 `arm64-v8a`와
`armeabi-v7a`용으로 각각 생성합니다.

PoC 동안 Android의 로컬 HTTP 접근과 화면 켜짐 유지, 가로 전체 화면을 활성화했습니다.
실운용 전에는 HTTPS, 인증 복구, 고정 서명 키를 적용해야 합니다.

### 임시 인증 우회

LightHouse 설치 PoC를 위해 `src/lib/auth-mode.ts`의 `AUTH_DISABLED`가 현재 `true`입니다.
페이지·관리 API·프로시저 감사 사용자는 로컬 테스트 관리자로 동작합니다. 선박 네트워크
운용 전에 반드시 `false`로 되돌리고 Auth.js 권한 검증을 다시 테스트하세요.

### 현재 구조상 확인할 제약

- APK에는 Next.js 서버가 들어가지 않으므로 Mac mini 서버와 선내 LAN이 항상 필요합니다.
- 서버 IP가 APK 설정에 들어가므로 고정 IP를 쓰거나 이후 서버 검색/설정 화면을 추가해야 합니다.
- Tauri 최소 요구 버전은 Android API 24입니다. LightHouse 4 장비의 실제 Android API와
  WebView 버전은 Axiom에서 설치·실행해 확인해야 합니다.
- 현재 로컬 HTTP를 허용했으며 서버 장애 시 전용 재연결 화면도 없습니다.
- 3D 화면은 WebGL 성능과 GPU 메모리를 실제 Axiom에서 확인해야 합니다.
- 800×480에서는 현재 상단 툴바와 320px 우측 패널이 화면을 많이 차지하므로, 설치 성공 후
  Axiom 전용 컴팩트 레이아웃을 별도로 적용하는 것이 좋습니다.
- JSON 파일 저장은 단일 Mac mini PoC에는 쓸 수 있지만, IoT 장비와 쓰기 작업이 많아지면
  SQLite 같은 트랜잭션 저장소로 옮겨야 합니다.
- `next/font/google` 때문에 새 서버 빌드에는 인터넷이 필요합니다. 실행 중에는 빌드에
  포함된 폰트를 사용하지만, 완전 오프라인 빌드를 원하면 로컬 폰트로 바꿔야 합니다.

## 아키텍처

| 계층 | 위치 | 교체 지점 |
|---|---|---|
| 도면(SVG) | `src/components/DeckPlanSvg.tsx` | — |
| 디바이스 레지스트리 | `src/lib/devices/registry.ts` (JSON) | → SQLite/Prisma |
| 센서 소스 | `src/lib/sensors/` (`SensorSource`) | → CAN/zigbee 구현 후 `SENSOR_SOURCE` env |
| 사용자 | `src/lib/users/registry.ts` (JSON) | → DB |
| 인증 | `src/auth.ts` / `src/auth.config.ts` / `src/proxy.ts` | — |

## 로드맵

1. ✅ 2D 도면 + 라벨 + 디바이스/센서 + 인증
2. **프로토콜 모드** — 항해 전/중/후 체크리스트, 누가 언제 체크했는지 감사 기록
3. **실통신** — CAN / zigbee `SensorSource` 구현
4. **3D 해부도** — 같은 디바이스 레지스트리를 3D 좌표로 확장

## 참고

- `data/users.json`, `.env.local` 은 커밋되지 않습니다(비밀번호 해시/시크릿 보호).
