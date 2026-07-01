import Dashboard from "@/components/Dashboard";
import UserMenu from "@/components/UserMenu";

export default function Home() {
  return <Dashboard rightSlot={<UserMenu />} />;
}
