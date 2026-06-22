import { Outlet } from "react-router-dom";
import { Sidebar } from "../components/chatPage/Sidebar";

export function HomepageLayout() {
  return (
    <div className="h-screen flex overflow-hidden bg-[var(--bg-primary)]">
      <Sidebar />

      <main className="flex-1 overflow-hidden">
        <Outlet />
      </main>
    </div>
  );
}
