import { MessageList } from "./MessageList";
import { ChatInput } from "./ChatInput";
import type { ChatMessage } from "../lib/a2a";

type Props = {
  messages: ChatMessage[];
  loading: boolean;
  error: string | null;
  inputDisabled: boolean;
  onSend: (message: string) => void;
};

export function ChatWindow({ messages, loading, error, inputDisabled, onSend }: Props) {
  return (
    <section className="chat-window">
      <div className="chat-scroll">
        <MessageList messages={messages} loading={loading} />
      </div>
      {error && <p className="banner err chat-error">{error}</p>}
      <ChatInput disabled={inputDisabled} onSend={onSend} />
    </section>
  );
}
