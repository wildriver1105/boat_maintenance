// 알림 설정/테스트 페이지 — 관리자 전용.
import { redirect } from "next/navigation";
import Link from "next/link";
import { auth } from "@/auth";
import NotificationsAdmin from "@/components/NotificationsAdmin";

export default async function NotificationsPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (session.user.role !== "admin") redirect("/");

  return (
    <div className="mx-auto min-h-screen w-full max-w-2xl p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-slate-800">🔔 푸시 알림</h1>
          <p className="text-xs text-slate-400">Pushover 연결 · 테스트 발송 · 자동 경고 알림</p>
        </div>
        <Link href="/" className="text-sm font-medium text-sky-600 hover:underline">
          ← 도면으로
        </Link>
      </div>
      <NotificationsAdmin />
    </div>
  );
}
