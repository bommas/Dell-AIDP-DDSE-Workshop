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

/** Known cities → default state + approximate downtown geo for distance filters. */
const CITY_CATALOG = [
  { name: "chicago", state: "IL", lat: 41.8781, lon: -87.6298 },
  { name: "austin", state: "TX", lat: 30.2672, lon: -97.7431 },
  { name: "houston", state: "TX", lat: 29.7604, lon: -95.3698 },
  { name: "dallas", state: "TX", lat: 32.7767, lon: -96.797 },
  { name: "new york", state: "NY", lat: 40.7128, lon: -74.006 },
  { name: "los angeles", state: "CA", lat: 34.0522, lon: -118.2437 },
  { name: "miami", state: "FL", lat: 25.7617, lon: -80.1918 },
  { name: "seattle", state: "WA", lat: 47.6062, lon: -122.3321 },
  { name: "denver", state: "CO", lat: 39.7392, lon: -104.9903 },
  { name: "atlanta", state: "GA", lat: 33.749, lon: -84.388 },
  { name: "phoenix", state: "AZ", lat: 33.4484, lon: -112.074 },
  { name: "boston", state: "MA", lat: 42.3601, lon: -71.0589 },
  { name: "philadelphia", state: "PA", lat: 39.9526, lon: -75.1652 },
  { name: "san francisco", state: "CA", lat: 37.7749, lon: -122.4194 },
  { name: "san antonio", state: "TX", lat: 29.4241, lon: -98.4936 },
];

const STATE_ALIASES = {
  illinois: "IL",
  texas: "TX",
  california: "CA",
  florida: "FL",
  "new york": "NY",
  washington: "WA",
  colorado: "CO",
  georgia: "GA",
  arizona: "AZ",
  massachusetts: "MA",
  pennsylvania: "PA",
};

const LOCATION_FILLER =
  /\b(in|near|around|at|within|close to|area|metro|greater|downtown|or)\b/gi;

const QUERY_FILLER =
  /\b(find|finding|looking for|search for|show me|get me|please|the|a|an|some|any)\b/gi;

/** Expand common layperson specialty phrases for lexical matching + exact specialty terms. */
const SPECIALTY_SYNONYMS = [
  {
    pattern: /\bkidney\b|\brenal\b|\bnephrolog/i,
    add: "nephrology renal dialysis",
    terms: ["Nephrology", "Dialysis and Renal Care"],
  },
  {
    pattern: /\bheart\b|\bcardiac\b|\bcardiolog/i,
    add: "cardiology",
    terms: ["Cardiology", "Cardiac Rehabilitation"],
  },
  {
    pattern: /\beye\b|\bvision\b|\boptical\b|\bophthalm|\boptometr/i,
    add: "ophthalmology optometry",
    terms: [
      "Ophthalmology",
      "Optometry",
      "Cataract Surgery",
      "Glaucoma Care",
      "Retinal and Vitreous Care",
      "Diabetic Eye Care",
    ],
  },
  {
    pattern: /\bdentist\b|\bdental\b|\bteeth\b|\btooth\b|\boral\b/i,
    add: "dental oral",
    terms: [],
  },
  {
    pattern: /\blung\b|\bbreathing\b|\bpulmon/i,
    add: "pulmonology respiratory",
    terms: ["Pulmonology", "Respiratory Therapy"],
  },
  {
    pattern: /\bskin\b|\bdermatolog/i,
    add: "dermatology",
    terms: ["Dermatology"],
  },
  {
    pattern: /\bbiabetes\b|\bdiabetic\b|\bendocrin/i,
    add: "endocrinology",
    terms: ["Endocrinology", "Diabetic Eye Care"],
  },
  {
    pattern: /\bstroke\b/i,
    add: "stroke rehabilitation",
    terms: ["Stroke Rehabilitation"],
  },
  {
    pattern: /\bgeriatric\b|\bsenior\b/i,
    add: "geriatric medicine",
    terms: ["Geriatric Medicine", "Behavioral Health for Seniors"],
  },
];

/**
 * Parse free-text search into specialty/topic text + optional city/geo filters
 * (mirrors example-queries ES|QL city/geo patterns).
 */
function parseSearchIntent(rawQuery) {
  const original = String(rawQuery || "").trim();
  let working = original;
  const lower = original.toLowerCase();

  const places = [];
  // Prefer longer city names first (e.g. "san francisco" before "san")
  const sortedCities = [...CITY_CATALOG].sort((a, b) => b.name.length - a.name.length);
  for (const city of sortedCities) {
    const re = new RegExp(`\\b${city.name.replace(/\s+/g, "\\s+")}\\b`, "i");
    if (re.test(working)) {
      places.push({ ...city });
      working = working.replace(re, " ");
    }
  }

  // Explicit state tokens (IL, Texas, etc.)
  let inferredState = null;
  for (const [name, code] of Object.entries(STATE_ALIASES)) {
    const re = new RegExp(`\\b${name}\\b`, "i");
    if (re.test(working)) {
      inferredState = code;
      working = working.replace(re, " ");
    }
  }
  const stateCodeMatch = working.match(/\b([A-Za-z]{2})\b/);
  if (stateCodeMatch && /^[A-Za-z]{2}$/.test(stateCodeMatch[1])) {
    const code = stateCodeMatch[1].toUpperCase();
    const known = new Set(CITY_CATALOG.map((c) => c.state));
    if (known.has(code) || places.length > 0) {
      inferredState = code;
      working = working.replace(stateCodeMatch[0], " ");
    }
  }

  // "within 25km/miles of …" radius
  let radiusKm = 40;
  const radiusMatch = lower.match(/\bwithin\s+(\d+)\s*(km|kilometers|mi|miles)\b/);
  if (radiusMatch) {
    const n = Number(radiusMatch[1]);
    radiusKm = radiusMatch[2].startsWith("mi") ? Math.round(n * 1.609) : n;
    working = working.replace(/\bwithin\s+\d+\s*(km|kilometers|mi|miles)\b/i, " ");
  }

  // Strict geo intent: near/around/within — NOT bare "area" (e.g. "Chicago area" = city filter)
  const useGeo = /\b(near|around|within|close to)\b/i.test(original) || /\bgeo\b/i.test(original);

  const resolvedPlaces = places.map((p) => ({
    ...p,
    state: inferredState && places.length === 1 ? inferredState : p.state,
  }));

  let topic = working
    .replace(LOCATION_FILLER, " ")
    .replace(QUERY_FILLER, " ")
    .replace(/\b(specialists?|doctors?|providers?|clinics?|care)\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!topic) {
    topic = original;
  }

  // Lexical expansion (kidney → nephrology) + exact specialty terms from the index
  const synonymExtras = [];
  const specialtyTerms = [];
  for (const syn of SPECIALTY_SYNONYMS) {
    if (syn.pattern.test(topic) || syn.pattern.test(original)) {
      synonymExtras.push(syn.add);
      for (const t of syn.terms || []) {
        if (!specialtyTerms.includes(t)) specialtyTerms.push(t);
      }
    }
  }
  const lexicalTopic = [topic, ...synonymExtras].join(" ").replace(/\s+/g, " ").trim();
  // Semantic prompt closer to what an agent interprets
  const semanticTopic = specialtyTerms.length
    ? `${topic} ${specialtyTerms.join(" ")}`
    : topic;

  return {
    original,
    topic,
    lexicalTopic,
    semanticTopic,
    specialtyTerms,
    places: resolvedPlaces,
    useGeo,
    radiusKm,
  };
}

function cityStateFilter(place) {
  const filters = [
    {
      term: {
        city: { value: place.name, case_insensitive: true },
      },
    },
  ];
  if (place.state) {
    filters.push({ term: { state: place.state } });
  }
  return { bool: { filter: filters } };
}

function geoFilter(place, radiusKm) {
  return {
    geo_distance: {
      distance: `${radiusKm}km`,
      location: { lat: place.lat, lon: place.lon },
    },
  };
}

/**
 * Build hybrid lexical + semantic Query DSL with optional city / geo filters.
 * Specialty relevance is primary (aligned with Agent Builder answers); location is a filter.
 */
function buildHybridSearchBody(intent, size) {
  const semanticQuery = intent.semanticTopic || intent.topic;
  const lexicalQuery = intent.lexicalTopic || intent.topic;

  // Specialty match is required. Prefer exact index specialties when we can resolve them
  // (e.g. kidney → Nephrology), matching how the AI agent interprets the ask.
  const specialtyShould = [
    {
      semantic: {
        field: "medical_specialty_semantic",
        query: semanticQuery,
      },
    },
    {
      multi_match: {
        query: lexicalQuery,
        fields: ["medical_specialty^10", "search_text^2"],
        type: "best_fields",
        operator: "or",
      },
    },
    {
      match_phrase: {
        medical_specialty: {
          query: intent.topic,
          boost: 4,
          slop: 3,
        },
      },
    },
  ];

  if (intent.specialtyTerms?.length) {
    specialtyShould.unshift({
      terms: {
        medical_specialty: intent.specialtyTerms,
        boost: 12,
      },
    });
  }

  const lexicalBoosts = [
    {
      multi_match: {
        query: lexicalQuery,
        fields: ["provider_name^2", "medical_specialty^6", "search_text"],
        type: "best_fields",
        fuzziness: "AUTO",
        operator: "or",
      },
    },
  ];

  const filter = [];
  if (intent.places.length > 0) {
    if (intent.useGeo) {
      filter.push({
        bool: {
          should: intent.places.map((p) => geoFilter(p, intent.radiusKm)),
          minimum_should_match: 1,
        },
      });
    } else {
      filter.push({
        bool: {
          should: intent.places.map((p) => cityStateFilter(p)),
          minimum_should_match: 1,
        },
      });
    }
  }

  // When we know exact specialties (agent-like intent), constrain to those specialties
  // so unrelated Chicago hits (e.g. Diabetic Eye Care for "kidney") cannot outrank.
  if (intent.specialtyTerms?.length) {
    filter.push({
      terms: { medical_specialty: intent.specialtyTerms },
    });
  }

  const body = {
    size,
    track_scores: true,
    query: {
      bool: {
        must: [
          {
            bool: {
              should: specialtyShould,
              minimum_should_match: 1,
            },
          },
        ],
        should: lexicalBoosts,
        filter,
      },
    },
    sort: ["_score"],
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

  if (intent.useGeo && intent.places.length === 1) {
    const p = intent.places[0];
    body.sort = [
      "_score",
      {
        _geo_distance: {
          location: { lat: p.lat, lon: p.lon },
          order: "asc",
          unit: "km",
        },
      },
    ];
  }

  return body;
}

function stripSemanticClauses(body) {
  const clone = JSON.parse(JSON.stringify(body));
  const should = clone?.query?.bool?.must?.[0]?.bool?.should;
  if (Array.isArray(should)) {
    clone.query.bool.must[0].bool.should = should.filter((c) => !c.semantic);
  }
  return clone;
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

  const intent = parseSearchIntent(query);
  const searchUrl = `${esUrl}/${encodeURIComponent(index)}/_search`;
  let body = buildHybridSearchBody(intent, size);

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
        body = stripSemanticClauses(body);
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
            intent,
          });
        }
        payload = retryPayload;
      } else {
        return res.status(response.status).json({
          error: `Search failed (${response.status})`,
          details: payload,
          intent,
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
      const sortVals = Array.isArray(hit.sort) ? hit.sort : [];
      // When sort is [_score, _geo_distance], distance is the last numeric geo value
      const sortDist =
        sortVals.length > 1 && typeof sortVals[sortVals.length - 1] === "number"
          ? sortVals[sortVals.length - 1]
          : undefined;
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
        distanceKm: typeof sortDist === "number" ? Math.round(sortDist * 10) / 10 : undefined,
        snippet,
        index,
      };
    });

    return res.json({
      total: payload?.hits?.total?.value ?? hits.length,
      took: payload?.took,
      intent,
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
