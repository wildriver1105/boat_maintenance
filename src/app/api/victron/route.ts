// Victron 읽기 API — 현재 스냅샷을 JSON 으로 반환한다.
// 첫 호출 때 서버 측 MQTT 싱글턴이 기동되어 venus.local 브로커에 접속하고,
// 이후 keepalive 로 값이 계속 갱신된다. 클라이언트(VictronPanel)는 이 엔드포인트를
// 주기적으로 폴링한다. (SSE 인 /api/telemetry 와 달리 단순 스냅샷 조회)

import { buildSnapshot } from "@/lib/victron/snapshot";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const snapshot = buildSnapshot();
  return Response.json(snapshot, {
    headers: { "Cache-Control": "no-store" },
  });
}
