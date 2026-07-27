// LightHouse/Tauri 설치 PoC 중에는 라우트 인증을 완전히 우회한다.
// Next.js 16에서는 기존 middleware.ts 대신 proxy.ts 규약을 사용한다.
import { NextResponse } from "next/server";

export function proxy() {
  return NextResponse.next();
}

/*
인증 복구 시 위 proxy()를 제거하고 아래 구성을 되살릴 것.

import NextAuth from "next-auth";
import { authConfig } from "./auth.config";

const { auth } = NextAuth(authConfig);
export const proxy = auth;
*/

export const config = {
  matcher: ["/((?!api/auth|_next/static|_next/image|favicon.ico).*)"],
};
