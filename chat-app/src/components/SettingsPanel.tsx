import { useState } from "react";
import type { A2AConfig } from "../lib/a2a";
import { fetchAgentCard } from "../lib/a2a";

type Props = {
  config: A2AConfig;
  open: boolean;
  onClose: () => void;
  onSave: (config: A2AConfig) => void;
};

export function SettingsPanel({ config, open, onClose, onSave }: Props) {
  const [draft, setDraft] = useState<A2AConfig>(config);
  const [testing, setTesting] = useState(false);
  const [testMessage, setTestMessage] = useState<string | null>(null);
  const [testError, setTestError] = useState<string | null>(null);

  if (!open) return null;

  function update<K extends keyof A2AConfig>(key: K, value: A2AConfig[K]) {
    setDraft((prev) => ({ ...prev, [key]: value }));
  }

  async function handleTest() {
    setTesting(true);
    setTestMessage(null);
    setTestError(null);
    try {
      const card = await fetchAgentCard(draft);
      const name =
        typeof card === "object" && card && "name" in card
          ? String((card as { name?: string }).name)
          : draft.agentId;
      setTestMessage(`Connected to agent card: ${name}`);
    } catch (err) {
      setTestError(err instanceof Error ? err.message : "Connection test failed");
    } finally {
      setTesting(false);
    }
  }

  function handleSave() {
    onSave(draft);
    onClose();
  }

  return (
    <div className="settings-backdrop" onClick={onClose} role="presentation">
      <aside
        className="settings-panel"
        role="dialog"
        aria-label="Connection settings"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="settings-header">
          <h2>Connection</h2>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Close settings">
            ×
          </button>
        </header>

        <p className="settings-lead">
          Configure Elasticsearch search and Agent Builder A2A. Values stay in this browser only.
        </p>

        <label className="field">
          <span>Kibana URL</span>
          <input
            type="url"
            placeholder="https://your-project.kb.us-east-1.aws.elastic.cloud"
            value={draft.kibanaUrl}
            onChange={(e) => update("kibanaUrl", e.target.value)}
            autoComplete="off"
          />
        </label>

        <label className="field">
          <span>Elasticsearch URL (optional)</span>
          <input
            type="url"
            placeholder="Derived from Kibana URL if empty (.kb. → .es.)"
            value={draft.esUrl}
            onChange={(e) => update("esUrl", e.target.value)}
            autoComplete="off"
          />
        </label>

        <label className="field">
          <span>Search index</span>
          <input
            type="text"
            placeholder="nursing-providers"
            value={draft.indexName}
            onChange={(e) => update("indexName", e.target.value)}
            autoComplete="off"
          />
        </label>

        <label className="field">
          <span>Agent ID</span>
          <input
            type="text"
            placeholder="elastic-ai-agent"
            value={draft.agentId}
            onChange={(e) => update("agentId", e.target.value)}
            autoComplete="off"
          />
        </label>

        <label className="field">
          <span>API key</span>
          <input
            type="password"
            placeholder="Elastic API key"
            value={draft.apiKey}
            onChange={(e) => update("apiKey", e.target.value)}
            autoComplete="off"
          />
        </label>

        {testMessage && <p className="banner ok">{testMessage}</p>}
        {testError && <p className="banner err">{testError}</p>}

        <div className="settings-actions">
          <button type="button" className="btn ghost" onClick={handleTest} disabled={testing}>
            {testing ? "Testing…" : "Test agent card"}
          </button>
          <button type="button" className="btn primary" onClick={handleSave}>
            Save
          </button>
        </div>
      </aside>
    </div>
  );
}
