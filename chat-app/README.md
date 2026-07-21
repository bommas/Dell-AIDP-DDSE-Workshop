# Elastic Search + AI Mode

Google-style search UI for workshop data:

- **All** — Elasticsearch keyword/semantic search results
- **AI Mode** — Agent Builder answer (A2A) on top, with the same search results below

The browser talks to a local Node proxy (`server.mjs`) for both `/api/search` and `/api/chat` (A2A).

## Prerequisites

- Node.js **20+** (required)
- An Elastic Cloud project with Agent Builder enabled
- An API key with Agent Builder privileges
- An agent ID (default Agent Builder agent is often `elastic-ai-agent`, or use your custom agent)

> Instruqt labs install Node 20 via NodeSource in `terminal-lifecycle.sh`. Do not rely on distro `apt install npm` alone — it is often too old for Vite.

## Setup

```bash
cd chat-app
npm install --no-workspaces
```

(`--no-workspaces` avoids accidentally installing into a parent `package.json` if one exists higher in your home directory.)

## Run

```bash
npm run dev
```

Or from `ElasticDataSets/`, `./setup_env.sh` installs chat-app deps (if needed) and starts the same process in the background.

This starts:

- A2A proxy on `0.0.0.0:5174`
- Vite UI on `0.0.0.0:5173` (proxies `/api` → the proxy; reachable from outside the container/host)

Open the UI and sign in with:

| Field | Value |
|-------|-------|
| Username | `admin` |
| Password | `admin` |

Then click **Settings** and enter:

| Field | Example |
|-------|---------|
| Kibana URL | `https://your-project.kb.us-east-1.aws.elastic.cloud` |
| Elasticsearch URL | optional — derived from Kibana (`.kb.` → `.es.`) if empty |
| Search index | `nursing-providers` |
| Agent ID | `elastic-ai-agent` (or your custom agent id) |
| API key | Elastic API key |

Use **Test agent card**, then search (e.g. “dentists in Chicago”). Switch between **All** and **AI Mode**.

Settings are stored in `localStorage` in this browser only.

## How it works

1. UI `POST /api/chat` with `{ kibanaUrl, agentId, apiKey, message }`
2. Proxy `POST {kibanaUrl}/api/agent_builder/a2a/{agentId}` with A2A `message/send`
3. Agent reply text is returned as `{ reply }`

Note: Elastic A2A does not currently support streaming; each question gets one response.

## Useful questions (workshop data)

If you have ingested the workshop datasets:

- Nursing providers: *“Which nursing homes in Alabama have the highest overall ratings?”*
- Ecommerce: *“Find tall bathroom storage cabinets under $100.”*

## Scripts

| Script | Purpose |
|--------|---------|
| `npm run dev` | Proxy + Vite together |
| `npm run proxy` | Proxy only |
| `npm run build` | Production build |
| `npm run preview` | Proxy + Vite preview |

## API (local proxy)

- `GET /api/health`
- `GET /api/agent-card?kibanaUrl=&agentId=&apiKey=`
- `POST /api/chat` body: `{ kibanaUrl, agentId, apiKey, message }`
