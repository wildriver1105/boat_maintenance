// 라우트 보호 미들웨어 — edge-safe authConfig 로 세션 확인.
import NextAuth from "next-auth";
import { authConfig } from "./auth.config";

const { auth } = NextAuth(authConfig);

export default auth;

export const config = {
  // api/auth(로그인 엔드포인트)와 정적 자원은 제외, 나머지는 인증 필요
  matcher: ["/((?!api/auth|_next/static|_next/image|favicon.ico).*)"],
};
