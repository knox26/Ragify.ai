import { ChatHeader } from "../components/chatPage/ChatHeader";
import { ChatContent } from "../components/chatPage/ChatContent";
import { ChatInput } from "../components/chatPage/ChatInput";

export function ChatPage() {
  return (
    <div className="h-screen flex bg-[var(--bg-primary)] text-[var(--text-primary)] overflow-hidden">
      <main className="flex-1 flex flex-col">
        <ChatHeader />

        <ChatContent />

        <ChatInput />
      </main>
    </div>
  );
}
