import { FileText, Menu, Plus, Search, MessageSquare } from "lucide-react";
import { Link } from "react-router-dom";

const chats = [
  "Revenue Analysis",
  "React Handbook",
  "AWS Architecture",
  "Prisma Design",
  "Authentication Flow",
];

export function Sidebar() {
  return (
    <aside className="w-72 border-r border-[var(--border-color)] bg-[var(--bg-card)] flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-4 border-b border-[var(--border-color)]">
        <div className="flex items-center gap-2">
          <div className="h-9 w-9 rounded-xl bg-cyan-400 flex items-center justify-center">
            <Search size={18} className="text-black" />
          </div>

          <span className="font-semibold text-lg">Ragify</span>
        </div>

        <button className="p-2 hover:bg-zinc-800 rounded-lg">
          <Menu size={18} />
        </button>
      </div>

      {/* New Chat */}
      <div className="p-4">
        <button className="w-full h-12 rounded-xl bg-gradient-to-r from-cyan-400 to-blue-600 text-white font-medium flex items-center justify-center gap-2">
          <Plus size={18} />
          New Chat
        </button>
      </div>

      {/* Search */}
      <div className="px-4">
        <button
          className="
      w-full
      h-12
      px-4
      rounded-xl
      border
      border-[var(--border-color)]
      flex
      items-center
      gap-3
      hover:bg-[var(--bg-section)]
      transition-colors
    "
        >
          <Search size={18} />

          <span className="flex-1 text-left text-secondary">Search Chats</span>

          <kbd className="text-xs px-2 py-1 rounded-md bg-[var(--bg-section)] border border-[var(--border-color)] text-secondary">
            Ctrl K
          </kbd>
        </button>
      </div>

      {/* Documents */}
      <div className="p-4">
        <Link
          to="/home/documents"
          className="flex items-center gap-3 px-4 py-3 rounded-xl card hover:bg-[var(--bg-section)] transition-all duration-200 group"
        >
          <div className="h-9 w-9 rounded-lg  flex items-center justify-center">
            <FileText
              size={18}
              className="text-[var(--accent)] transition-transform duration-200 group-hover:scale-110"
            />
          </div>

          <span className="font-medium">Documents</span>
        </Link>
      </div>

      {/* Recent Chats */}
      <div className="flex-1 overflow-y-auto px-3">
        <h3 className="text-sm text-secondary mb-3 px-2">Recent Chats</h3>

        <div className="space-y-1">
          {chats.map((chat) => (
            <button
              key={chat}
              className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-[var(--bg-section)] text-left"
            >
              <MessageSquare size={16} />

              <span className="truncate">{chat}</span>
            </button>
          ))}
        </div>
      </div>

      {/* User */}
      <div className="border-t border-[var(--border-color)] p-4">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-full bg-blue-600 flex items-center justify-center text-white">
            K
          </div>

          <div>
            <p className="font-medium">Knox</p>
            <p className="text-xs text-secondary">knox@example.com</p>
          </div>
        </div>
      </div>
    </aside>
  );
}
