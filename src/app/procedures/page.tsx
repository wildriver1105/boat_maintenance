// 프로시저(체크리스트) 페이지 — 로그인 필요. 키오스크 대시보드와 별도의 일반 화면.
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import ProceduresView from "@/components/procedures/ProceduresView";

export default async function ProceduresPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  return <ProceduresView />;
}
