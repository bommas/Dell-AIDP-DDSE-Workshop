/**
 * Local A2A proxy for the Elastic Agent Builder chat demo.
 * Forwards chat requests to Kibana so the browser avoids CORS
 * and never talks to Kibana directly.
 */
import cors from "cors";
import express from "express";
import { randomUUID } from "node:crypto";

const PORT = Number(process.env.PROXY_PORT || 5174);
const HOST = process.env.PROXY_HOST || "0.0.0.0";


const app = express();
app.use(cors());
app.use(express.json({ limit: "1mb" }));

function normalizeBaseUrl(url) {
  return String(url || "").trim().replace(/\/+$/, "");
}

function apiKeyHeader(apiKey) {
  const key = String(apiKey || "").trim();
  if (!key) return "";
  if (/^apikey\s+/i.test(key)) return key;
  return `ApiKey ${key}`;
}

function extractTextFromResult(result) {
  if (result == null) return "";
  if (typeof result === "string") return result;

  // Elastic / A2A variants seen in the wild
  const direct =
    result?.response?.message ||
    result?.message ||
    result?.content ||
    result?.text;
  if (typeof direct === "string" && direct.trim()) return direct.trim();

  const parts = result?.parts || result?.message?.parts || result?.response?.parts;
  if (Array.isArray(parts)) {
    const text = parts
      .map((p) => (typeof p?.text === "string" ? p.text : typeof p === "string" ? p : ""))
      .filter(Boolean)
      .join("\n")
      .trim();
    if (text) return text;
  }

  // Nested artifacts / status messages (A2A task style)
  const artifacts = result?.artifacts;
  if (Array.isArray(artifacts)) {
    const text = artifacts
      .flatMap((a) => a?.parts || [])
      .map((p) => p?.text)
      .filter((t) => typeof t === "string")
      .join("\n")
      .trim();
    if (text) return text;
  }

  try {
    return JSON.stringify(result, null, 2);
  } catch {
    return String(result);
  }
}

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, service: "a2a-proxy" });
});

app.get("/api/agent-card", async (req, res) => {
  const kibanaUrl = normalizeBaseUrl(req.query.kibanaUrl);
  const agentId = String(req.query.agentId || "").trim();
  const apiKey = apiKeyHeader(req.query.apiKey);

  if (!kibanaUrl || !agentId || !apiKey) {
    return res.status(400).json({
      error: "kibanaUrl, agentId, and apiKey are required",
    });
  }

  const cardUrl = `${kibanaUrl}/api/agent_builder/a2a/${encodeURIComponent(agentId)}.json`;

  try {
    const response = await fetch(cardUrl, {
      method: "GET",
      headers: {
        Authorization: apiKey,
        Accept: "application/json",
        "kbn-xsrf": "true",
      },
    });
    const text = await response.text();
    let body;
    try {
      body = text ? JSON.parse(text) : {};
    } catch {
      body = { raw: text };
    }
    if (!response.ok) {
      return res.status(response.status).json({
        error: `Agent card request failed (${response.status})`,
        details: body,
      });
    }
    return res.json({ card: body });
  } catch (err) {
    return res.status(502).json({
      error: err instanceof Error ? err.message : "Failed to fetch agent card",
    });
  }
});

app.post("/api/chat", async (req, res) => {
  const kibanaUrl = normalizeBaseUrl(req.body?.kibanaUrl);
  const agentId = String(req.body?.agentId || "").trim();
  const apiKey = apiKeyHeader(req.body?.apiKey);
  const message = String(req.body?.message || "").trim();

  if (!kibanaUrl || !agentId || !apiKey || !message) {
    return res.status(400).json({
      error: "kibanaUrl, agentId, apiKey, and message are required",
    });
  }

  const requestId = randomUUID();
  const messageId = randomUUID();
  const a2aUrl = `${kibanaUrl}/api/agent_builder/a2a/${encodeURIComponent(agentId)}`;

  const payload = {
    jsonrpc: "2.0",
    id: requestId,
    method: "message/send",
    params: {
      message: {
        role: "user",
        kind: "message",
        messageId,
        parts: [{ kind: "text", text: message }],
      },
    },
  };

  try {
    const response = await fetch(a2aUrl, {
      method: "POST",
      headers: {
        Authorization: apiKey,
        "Content-Type": "application/json",
        Accept: "application/json",
        "kbn-xsrf": "true",
      },
      body: JSON.stringify(payload),
    });

    const text = await response.text();
    let body;
    try {
      body = text ? JSON.parse(text) : {};
    } catch {
      body = { raw: text };
    }

    if (!response.ok) {
      return res.status(response.status).json({
        error: `A2A request failed (${response.status})`,
        details: body,
      });
    }

    if (body?.error) {
      return res.status(502).json({
        error: body.error?.message || "A2A JSON-RPC error",
        details: body.error,
      });
    }

    const reply = extractTextFromResult(body?.result) || "No text response from agent.";
    return res.json({ reply, raw: body });
  } catch (err) {
    return res.status(502).json({
      error: err instanceof Error ? err.message : "Failed to reach Elastic A2A endpoint",
    });
  }
});

app.listen(PORT, HOST, () => {
  console.log(`[a2a-proxy] listening on http://${HOST}:${PORT}`);
});
