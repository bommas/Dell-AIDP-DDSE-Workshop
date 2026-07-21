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

function resolveEsUrl(esUrl, kibanaUrl) {
  const explicit = normalizeBaseUrl(esUrl);
  if (explicit) return explicit;
  const kb = normalizeBaseUrl(kibanaUrl);
  if (kb && kb.includes(".kb.")) return kb.replace(".kb.", ".es.");
  return "";
}

app.post("/api/search", async (req, res) => {
  const esUrl = resolveEsUrl(req.body?.esUrl, req.body?.kibanaUrl);
  const apiKey = apiKeyHeader(req.body?.apiKey);
  const index = String(req.body?.index || "nursing-providers").trim();
  const query = String(req.body?.query || "").trim();
  const size = Math.min(Number(req.body?.size) || 10, 25);

  if (!esUrl || !apiKey || !query) {
    return res.status(400).json({
      error: "esUrl (or kibanaUrl), apiKey, and query are required",
    });
  }

  const searchUrl = `${esUrl}/${encodeURIComponent(index)}/_search`;
  const body = {
    size,
    query: {
      bool: {
        should: [
          {
            multi_match: {
              query,
              fields: [
                "provider_name^3",
                "medical_specialty^2",
                "city^2",
                "state",
                "search_text",
                "county",
                "ownership_type",
              ],
              type: "best_fields",
              fuzziness: "AUTO",
            },
          },
          {
            semantic: {
              field: "medical_specialty_semantic",
              query,
            },
          },
        ],
        minimum_should_match: 1,
      },
    },
    _source: [
      "provider_name",
      "medical_specialty",
      "city",
      "state",
      "provider_address",
      "overall_rating",
      "avg_patient_rating",
      "location",
      "telephone",
      "zip_code",
    ],
    highlight: {
      fields: {
        provider_name: {},
        medical_specialty: {},
        search_text: {},
        city: {},
      },
      pre_tags: ["<em>"],
      post_tags: ["</em>"],
    },
  };

  try {
    const response = await fetch(searchUrl, {
      method: "POST",
      headers: {
        Authorization: apiKey,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(body),
    });
    const text = await response.text();
    let payload;
    try {
      payload = text ? JSON.parse(text) : {};
    } catch {
      payload = { raw: text };
    }
    if (!response.ok) {
      // Fallback without semantic clause if cluster rejects it
      if (response.status === 400 && /semantic/i.test(JSON.stringify(payload))) {
        delete body.query.bool.should[1];
        body.query.bool.should = [body.query.bool.should[0]];
        const retry = await fetch(searchUrl, {
          method: "POST",
          headers: {
            Authorization: apiKey,
            "Content-Type": "application/json",
            Accept: "application/json",
          },
          body: JSON.stringify(body),
        });
        const retryText = await retry.text();
        const retryPayload = retryText ? JSON.parse(retryText) : {};
        if (!retry.ok) {
          return res.status(retry.status).json({
            error: `Search failed (${retry.status})`,
            details: retryPayload,
          });
        }
        payload = retryPayload;
      } else {
        return res.status(response.status).json({
          error: `Search failed (${response.status})`,
          details: payload,
        });
      }
    }

    const hits = (payload?.hits?.hits || []).map((hit) => {
      const src = hit._source || {};
      const hl = hit.highlight || {};
      const snippetParts = [
        ...(hl.medical_specialty || []),
        ...(hl.search_text || []),
        ...(hl.city || []),
        ...(hl.provider_name || []),
      ];
      const snippet =
        snippetParts[0] ||
        [src.medical_specialty, src.city, src.state, src.provider_address].filter(Boolean).join(" · ");
      return {
        id: hit._id,
        score: hit._score,
        title: src.provider_name || hit._id,
        specialty: src.medical_specialty || "",
        city: src.city || "",
        state: src.state || "",
        address: src.provider_address || "",
        rating: src.overall_rating,
        patientRating: src.avg_patient_rating,
        telephone: src.telephone || "",
        zip: src.zip_code || "",
        location: src.location || null,
        snippet,
        index,
      };
    });

    return res.json({
      total: payload?.hits?.total?.value ?? hits.length,
      took: payload?.took,
      hits,
    });
  } catch (err) {
    return res.status(502).json({
      error: err instanceof Error ? err.message : "Failed to reach Elasticsearch",
    });
  }
});

app.listen(PORT, HOST, () => {
  console.log(`[a2a-proxy] listening on http://${HOST}:${PORT}`);
});
