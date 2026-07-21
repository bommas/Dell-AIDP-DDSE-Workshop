import { useMemo, useState } from "react";
import { AiOverview } from "./components/AiOverview";
import { LoginScreen } from "./components/LoginScreen";
import { SearchBox } from "./components/SearchBox";
import { SearchResults } from "./components/SearchResults";
import { SearchTabs, type SearchTab } from "./components/SearchTabs";
import { SettingsPanel } from "./components/SettingsPanel";
import {
  isConfigReady,
  loadConfig,
  runSearch,
  saveConfig,
  sendChat,
  type A2AConfig,
  type SearchHit,
} from "./lib/a2a";
import "./styles.css";

const AUTH_KEY = "a2a-chat-authed";

function loadAuthed(): boolean {
  return sessionStorage.getItem(AUTH_KEY) === "1";
}

export default function App() {
  const [authed, setAuthed] = useState(() => loadAuthed());
  const [config, setConfig] = useState<A2AConfig>(() => loadConfig());
  const [settingsOpen, setSettingsOpen] = useState(() => !isConfigReady(loadConfig()));
  const [tab, setTab] = useState<SearchTab>("ai");
  const [draftQuery, setDraftQuery] = useState("");
  const [activeQuery, setActiveQuery] = useState("");
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [total, setTotal] = useState(0);
  const [took, setTook] = useState<number | undefined>();
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [aiAnswer, setAiAnswer] = useState<string | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);

  const ready = useMemo(() => isConfigReady(config), [config]);
  const hasSearched = Boolean(activeQuery);

  function handleLoginSuccess() {
    sessionStorage.setItem(AUTH_KEY, "1");
    setAuthed(true);
  }

  function handleLogout() {
    sessionStorage.removeItem(AUTH_KEY);
    setAuthed(false);
    setActiveQuery("");
    setHits([]);
    setAiAnswer(null);
  }

  function handleSaveConfig(next: A2AConfig) {
    saveConfig(next);
    setConfig(next);
  }

  async function runSearchQuery(q: string) {
    setSearchLoading(true);
    setSearchError(null);
    try {
      const result = await runSearch(config, q);
      setHits(result.hits);
      setTotal(result.total);
      setTook(result.took);
    } catch (err) {
      setHits([]);
      setTotal(0);
      setSearchError(err instanceof Error ? err.message : "Search failed");
    } finally {
      setSearchLoading(false);
    }
  }

  async function runAiQuery(q: string) {
    setAiLoading(true);
    setAiError(null);
    try {
      const reply = await sendChat(config, q);
      setAiAnswer(reply);
    } catch (err) {
      setAiAnswer(null);
      setAiError(err instanceof Error ? err.message : "AI request failed");
    } finally {
      setAiLoading(false);
    }
  }

  async function handleSearch(q: string) {
    if (!ready) {
      setSettingsOpen(true);
      return;
    }
    setDraftQuery(q);
    setActiveQuery(q);
    setAiAnswer(null);
    setAiError(null);

    const tasks: Promise<void>[] = [runSearchQuery(q)];
    if (tab === "ai") {
      tasks.push(runAiQuery(q));
    }
    await Promise.all(tasks);
  }

  async function handleTabChange(next: SearchTab) {
    setTab(next);
    if (next === "ai" && activeQuery && !aiAnswer && !aiLoading && ready) {
      await runAiQuery(activeQuery);
    }
  }

  if (!authed) {
    return <LoginScreen onSuccess={handleLoginSuccess} />;
  }

  return (
    <div className={hasSearched ? "gs-app results-mode" : "gs-app home-mode"}>
      <div className="gs-ambient" aria-hidden="true" />

      <header className="gs-topbar">
        <button type="button" className="gs-logo" onClick={() => setActiveQuery("")}>
          <span className="gs-logo-mark">elastic</span>
          <span className="gs-logo-sub">Search</span>
        </button>
        <div className="gs-top-actions">
          <button type="button" className="btn ghost" onClick={() => setSettingsOpen(true)}>
            Settings
          </button>
          <button type="button" className="btn ghost" onClick={handleLogout}>
            Sign out
          </button>
        </div>
      </header>

      {!ready && (
        <p className="banner warn gs-banner">
          Open Settings and add Kibana URL, Agent ID, and API key to search.
        </p>
      )}

      {!hasSearched ? (
        <main className="gs-home">
          <h1 className="gs-home-title">
            <span className="gs-logo-mark">elastic</span> Search
          </h1>
          <p className="gs-home-lead">Ask anything — All results or AI Mode with your Elastic agent.</p>
          <SearchBox
            value={draftQuery}
            autoFocus
            onChange={setDraftQuery}
            onSubmit={handleSearch}
          />
          <div className="gs-suggestions">
            {[
              "dentists in Chicago",
              "providers near Austin Texas",
              "high rated nursing homes in Illinois",
            ].map((s) => (
              <button key={s} type="button" className="gs-chip" onClick={() => handleSearch(s)}>
                {s}
              </button>
            ))}
          </div>
        </main>
      ) : (
        <main className="gs-results-page">
          <div className="gs-results-search">
            <SearchBox value={draftQuery} onChange={setDraftQuery} onSubmit={handleSearch} />
          </div>

          <SearchTabs active={tab} onChange={handleTabChange} />

          <div className="gs-content">
            {tab === "ai" && (
              <AiOverview
                query={activeQuery}
                answer={aiAnswer}
                loading={aiLoading}
                error={aiError}
              />
            )}

            {searchError && <p className="banner err">{searchError}</p>}

            <div className="gs-results-block">
              {tab === "ai" && <h2 className="gs-section-label">Search results</h2>}
              <SearchResults
                query={activeQuery}
                total={total}
                took={took}
                hits={hits}
                loading={searchLoading}
              />
            </div>
          </div>
        </main>
      )}

      <SettingsPanel
        config={config}
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        onSave={handleSaveConfig}
      />
    </div>
  );
}
