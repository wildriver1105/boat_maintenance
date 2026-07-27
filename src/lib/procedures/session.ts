// API 라우트에서 현재 세션 사용자를 감사용 형태로 얻는다.
import { auth } from "@/auth";
import { AUTH_DISABLED, AUTH_TEST_USER } from "@/lib/auth-mode";
import type { ActingUser } from "./registry";

export async function actingUser(): Promise<ActingUser | null> {
  if (AUTH_DISABLED) {
    return { id: AUTH_TEST_USER.id, name: AUTH_TEST_USER.name };
  }
  const session = await auth();
  const u = session?.user;
  if (!u) return null;
  return {
    id: u.id ?? u.email ?? "unknown",
    name: u.name ?? u.email ?? "알 수 없음",
  };
}
