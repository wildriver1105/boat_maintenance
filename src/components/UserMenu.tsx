// 툴바 우측 사용자 메뉴 — 이름/역할 표시, 관리자면 크루 관리 링크, 로그아웃.
"use client";

import Link from "next/link";
import { signOut, useSession } from "next-auth/react";

export default function UserMenu() {
  const { data: session } = useSession();
  const user = session?.user;
  if (!user) return null;
  const isAdmin = user.role === "admin";

  return (
    <div className="flex items-center gap-3 border-l border-slate-200 pl-4">
      <div className="text-right">
        <div className="text-sm font-medium text-slate-700">{user.name}</div>
        <div className="text-[11px] text-slate-400">
          {isAdmin ? "관리자" : "크루"}
        </div>
      </div>
      {isAdmin && (
        <Link
          href="/admin/users"
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          크루 관리
        </Link>
      )}
      <button
        onClick={() => signOut({ callbackUrl: "/login" })}
        className="rounded-lg px-3 py-2 text-sm font-medium text-slate-500 hover:bg-slate-100"
      >
        로그아웃
      </button>
    </div>
  );
}
