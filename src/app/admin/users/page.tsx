// 크루 관리 페이지 — 관리자 전용(서버에서 역할 확인 후 렌더).
import { redirect } from "next/navigation";
import Link from "next/link";
import { auth } from "@/auth";
import UsersManager from "@/components/UsersManager";

export default async function AdminUsersPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (session.user.role !== "admin") redirect("/");

  return (
    <div className="mx-auto min-h-screen w-full max-w-3xl p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-slate-800">크루 관리</h1>
          <p className="text-xs text-slate-400">
            배를 관리하는 사람들의 명단. 계정을 생성·삭제할 수 있습니다.
          </p>
        </div>
        <Link href="/" className="text-sm font-medium text-sky-600 hover:underline">
          ← 도면으로
        </Link>
      </div>
      <UsersManager />
    </div>
  );
}
