// Next.js instrumentation — 서버 부팅 시 1회 실행.
// 알림 모니터와 계측 이력 수집기를 기동한다.
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { startAlertMonitor } = await import("./lib/notifications/monitor");
    startAlertMonitor();
    // 이력 수집은 알림과 별개다 — 알림을 꺼도 추이는 계속 쌓여야 나중에 돌아볼 수 있다
    const { startHistoryCollector } = await import("./lib/history/store");
    startHistoryCollector();
  }
}
