"use client";

import type { ReactNode } from "react";
import { SessionProvider } from "next-auth/react";
import { AUTH_DISABLED } from "@/lib/auth-mode";

export default function Providers({ children }: { children: ReactNode }) {
  // LightHouse/Tauri 설치 PoC 중에는 Auth.js 세션 요청도 만들지 않는다.
  if (AUTH_DISABLED) return children;
  return <SessionProvider>{children}</SessionProvider>;
}
