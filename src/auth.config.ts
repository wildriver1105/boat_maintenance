// Edge-safe 인증 설정 — 미들웨어(라우트 보호)에서 사용. bcrypt/파일IO 를 import 하지 않는다.
import type { NextAuthConfig } from "next-auth";

export const authConfig = {
  pages: { signIn: "/login" },
  session: { strategy: "jwt" },
  providers: [], // 실제 Credentials provider 는 auth.ts(Node 런타임)에서 주입
  callbacks: {
    // 미들웨어 보호: 로그인 페이지 외에는 인증 필요
    authorized({ auth, request }) {
      const isLoggedIn = !!auth?.user;
      const { pathname } = request.nextUrl;
      if (pathname.startsWith("/login")) return true;
      return isLoggedIn;
    },
    jwt({ token, user }) {
      if (user) token.role = (user as { role?: string }).role;
      return token;
    },
    session({ session, token }) {
      if (session.user && typeof token.role === "string") {
        (session.user as { role?: string }).role = token.role;
      }
      return session;
    },
  },
} satisfies NextAuthConfig;
