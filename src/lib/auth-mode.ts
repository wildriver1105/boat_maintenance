// LightHouse / Tauri PoC 동안에만 인증을 우회한다.
// 실제 운용 전 반드시 false로 되돌리고 모든 권한 테스트를 다시 수행할 것.
export const AUTH_DISABLED = true;

export const AUTH_TEST_USER = {
  id: "local-display",
  email: "display@boat.local",
  name: "선내 디스플레이",
  role: "admin",
} as const;
