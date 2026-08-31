import { Outlet } from "react-router-dom";
import { Sidebar } from "../components/chatPage/Sidebar";

/**
 * The authenticated app shell — chat + documents.
 *
 * `.landing` forces the landing's dark data-command palette on the whole app
 * (independent of any light/dark toggle), so the workspace you sign into is
 * the same world the landing page sells.
 */
export function HomepageLayout() {
  return (
    <div className="landing h-screen flex overflow-hidden bg-[var(--bg-primary)]">
      <Sidebar />

      <main className="flex-1 overflow-hidden">
        <Outlet />
      </main>
    </div>
  );
}
