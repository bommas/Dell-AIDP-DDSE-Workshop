export type A2AConfig = {
  kibanaUrl: string;
  esUrl: string;
  agentId: string;
  apiKey: string;
  indexName: string;
};

export type ChatMessage = {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  createdAt: number;
};

export type SearchHit = {
  id: string;
  score?: number;
  title: string;
  specialty: string;
  city: string;
  state: string;
  address: string;
  rating?: number;
  patientRating?: number;
  telephone: string;
  zip: string;
  location: { lat: number; lon: number } | null;
  distanceKm?: number;
  snippet: string;
  index: string;
};

export type SearchResponse = {
  total: number;
  took?: number;
  hits: SearchHit[];
};

const STORAGE_KEY = "a2a-chat-config";

export const DEFAULT_CONFIG: A2AConfig = {
  kibanaUrl: "",
  esUrl: "",
  agentId: "elastic-ai-agent",
  apiKey: "",
  indexName: "nursing-providers",
};

export function loadConfig(): A2AConfig {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_CONFIG };
    const parsed = JSON.parse(raw) as Partial<A2AConfig>;
    return {
      kibanaUrl: parsed.kibanaUrl ?? "",
      esUrl: parsed.esUrl ?? "",
      agentId: parsed.agentId || DEFAULT_CONFIG.agentId,
      apiKey: parsed.apiKey ?? "",
      indexName: parsed.indexName || DEFAULT_CONFIG.indexName,
    };
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}

export function saveConfig(config: A2AConfig): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
}

export function isConfigReady(config: A2AConfig): boolean {
  return Boolean(
    (config.kibanaUrl.trim() || config.esUrl.trim()) &&
      config.agentId.trim() &&
      config.apiKey.trim(),
  );
}

export async function sendChat(config: A2AConfig, message: string): Promise<string> {
  const response = await fetch("/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      kibanaUrl: config.kibanaUrl.trim(),
      agentId: config.agentId.trim(),
      apiKey: config.apiKey.trim(),
      message: message.trim(),
    }),
  });

  const data = (await response.json()) as { reply?: string; error?: string; details?: unknown };

  if (!response.ok) {
    const detail =
      typeof data.details === "string"
        ? data.details
        : data.details
          ? JSON.stringify(data.details)
          : "";
    throw new Error([data.error || `Request failed (${response.status})`, detail].filter(Boolean).join(" — "));
  }

  if (!data.reply) {
    throw new Error(data.error || "Empty reply from agent");
  }

  return data.reply;
}

export async function runSearch(config: A2AConfig, query: string): Promise<SearchResponse> {
  const response = await fetch("/api/search", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      kibanaUrl: config.kibanaUrl.trim(),
      esUrl: config.esUrl.trim(),
      apiKey: config.apiKey.trim(),
      index: config.indexName.trim() || "nursing-providers",
      query: query.trim(),
    }),
  });

  const data = (await response.json()) as SearchResponse & { error?: string; details?: unknown };
  if (!response.ok) {
    throw new Error(data.error || `Search failed (${response.status})`);
  }
  return {
    total: data.total ?? data.hits?.length ?? 0,
    took: data.took,
    hits: data.hits || [],
  };
}

export async function fetchAgentCard(config: A2AConfig): Promise<unknown> {
  const params = new URLSearchParams({
    kibanaUrl: config.kibanaUrl.trim(),
    agentId: config.agentId.trim(),
    apiKey: config.apiKey.trim(),
  });
  const response = await fetch(`/api/agent-card?${params.toString()}`);
  const data = (await response.json()) as { card?: unknown; error?: string; details?: unknown };
  if (!response.ok) {
    throw new Error(data.error || `Agent card failed (${response.status})`);
  }
  return data.card;
}
