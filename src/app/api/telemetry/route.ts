// 텔레메트리 SSE 스트림.
// 주기적으로 활성 센서 소스에서 리딩을 읽어 클라이언트로 push 한다.
// CAN/zigbee 로 전환하면 소스만 바뀌고 이 엔드포인트는 그대로 재사용된다.

import { readDevices } from "@/lib/devices/registry";
import { getSensorSource } from "@/lib/sensors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const INTERVAL_MS = 2000;

export async function GET(req: Request) {
  const source = getSensorSource();
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    start(controller) {
      let closed = false;

      const send = (event: string, data: unknown) => {
        if (closed) return;
        controller.enqueue(
          encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`),
        );
      };

      const tick = async () => {
        try {
          const devices = await readDevices();
          const readings = await source.getReadings(devices);
          send("telemetry", { source: source.name, readings });
        } catch (err) {
          send("error", { message: (err as Error).message });
        }
      };

      send("hello", { source: source.name, intervalMs: INTERVAL_MS });
      void tick();
      const timer = setInterval(tick, INTERVAL_MS);

      const close = () => {
        if (closed) return;
        closed = true;
        clearInterval(timer);
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      };

      req.signal.addEventListener("abort", close);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
