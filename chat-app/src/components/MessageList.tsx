import type { ChatMessage } from "../lib/a2a";

type Props = {
  messages: ChatMessage[];
  loading: boolean;
};

export function MessageList({ messages, loading }: Props) {
  if (messages.length === 0 && !loading) {
    return (
      <div className="empty-state">
        <p className="empty-title">Ask your Elastic agent</p>
        <p className="empty-copy">
          Questions are sent over A2A to Agent Builder and answered with your project data.
        </p>
      </div>
    );
  }

  return (
    <div className="message-list" aria-live="polite">
      {messages.map((msg) => (
        <article key={msg.id} className={`bubble ${msg.role}`}>
          <span className="bubble-role">{msg.role === "user" ? "You" : "Agent"}</span>
          <div className="bubble-body">{msg.content}</div>
        </article>
      ))}
      {loading && (
        <article className="bubble assistant pending">
          <span className="bubble-role">Agent</span>
          <div className="bubble-body thinking">
            <span />
            <span />
            <span />
          </div>
        </article>
      )}
    </div>
  );
}
