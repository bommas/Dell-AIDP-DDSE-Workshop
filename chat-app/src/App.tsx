import { useMemo, useState } from "react";
import { ChatWindow } from "./components/ChatWindow";
import { LoginScreen } from "./components/LoginScreen";
import { SettingsPanel } from "./components/SettingsPanel";
import {
  isConfigReady,
  loadConfig,
  saveConfig,
  sendChat,
  type A2AConfig,
  type ChatMessage,
} from "./lib/a2a";
import "./styles.css";

const AUTH_KEY = "a2a-chat-authed";

function newId(): string {
  return crypto.randomUUID();
}

function loadAuthed(): boolean {
  return sessionStorage.getItem(AUTH_KEY) === "1";
}

export default function App() {
  const [authed, setAuthed] = useState(() => loadAuthed());
  const [config, setConfig] = useState<A2AConfig>(() => loadConfig());
  const [settingsOpen, setSettingsOpen] = useState(() => !isConfigReady(loadConfig()));
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const ready = useMemo(() => isConfigReady(config), [config]);

  function handleLoginSuccess() {
    sessionStorage.setItem(AUTH_KEY, "1");
    setAuthed(true);
  }

  function handleLogout() {
    sessionStorage.removeItem(AUTH_KEY);
    setAuthed(false);
    setMessages([]);
    setError(null);
  }

  function handleSaveConfig(next: A2AConfig) {
    saveConfig(next);
    setConfig(next);
    setError(null);
  }

  async function handleSend(text: string) {
    if (!ready) {
      setSettingsOpen(true);
      setError("Configure Kibana URL, Agent ID, and API key before chatting.");
      return;
    }

    const userMsg: ChatMessage = {
      id: newId(),
      role: "user",
      content: text,
      createdAt: Date.now(),
    };
    setMessages((prev) => [...prev, userMsg]);
    setLoading(true);
    setError(null);

    try {
      const reply = await sendChat(config, text);
      const assistantMsg: ChatMessage = {
        id: newId(),
        role: "assistant",
        content: reply,
        createdAt: Date.now(),
      };
      setMessages((prev) => [...prev, assistantMsg]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Chat request failed");
    } finally {
      setLoading(false);
    }
  }

  if (!authed) {
    return <LoginScreen onSuccess={handleLoginSuccess} />;
  }

  return (
    <div className="app-shell">
      <div className="ambient" aria-hidden="true" />
      <header className="app-header">
        <div className="brand-block">
          <p className="brand">Elastic A2A Chat</p>
          <h1>Talk to your agent</h1>
        </div>
        <div className="header-actions">
          <button
            type="button"
            className="btn ghost"
            onClick={() => setSettingsOpen(true)}
            aria-label="Open connection settings"
          >
            Settings
          </button>
          <button type="button" className="btn ghost" onClick={handleLogout}>
            Sign out
          </button>
        </div>
      </header>

      {!ready && (
        <p className="banner warn">
          Add your Kibana URL, Agent ID, and API key in Settings to start chatting.
        </p>
      )}

      <ChatWindow
        messages={messages}
        loading={loading}
        error={error}
        inputDisabled={loading || !ready}
        onSend={handleSend}
      />

      <SettingsPanel
        config={config}
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        onSave={handleSaveConfig}
      />
    </div>
  );
}
