// Next.js instrumentation — 서버 부팅 시 1회 실행. 알림 모니터를 기동한다.
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { startAlertMonitor } = await import("./lib/notifications/monitor");
    startAlertMonitor();
  }
}
