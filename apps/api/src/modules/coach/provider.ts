export type LlmProviderName = "openai" | "ollama";
export type LlmHost = "openai" | "ollama-cloud" | "ollama-local";

export type LlmEnvSlice = {
  LLM_PROVIDER: "auto" | "openai" | "ollama";
  OPENAI_API_KEY?: string;
  OPENAI_BASE_URL: string;
  OPENAI_MODEL: string;
  OPENAI_EMBEDDING_MODEL: string;
  OLLAMA_API_KEY?: string;
  OLLAMA_BASE_URL?: string;
  OLLAMA_HOST?: string;
  OLLAMA_MODEL?: string;
  OLLAMA_EMBEDDING_MODEL: string;
};

export type LlmRuntime = {
  name: LlmProviderName;
  host: LlmHost;
  baseUrl: string;
  apiKey?: string;
  model: string;
  embeddingModel: string;
  chatTimeoutMs: number;
  sendOpenAiPenalties: boolean;
  supportsTools: boolean;
};

const OLLAMA_CLOUD = "https://ollama.com/v1";
const OLLAMA_LOCAL = "http://127.0.0.1:11434/v1";

function stripSlash(value: string) {
  return value.replace(/\/$/, "");
}

function withOpenAiV1(host: string) {
  const normalized = /^https?:\/\//i.test(host) ? host : `http://${host}`;
  const base = stripSlash(normalized);
  if (base.endsWith("/v1")) return base;
  return `${base}/v1`;
}

function looksLikeOllama(url?: string) {
  if (!url) return false;
  return /ollama\.com|11434|127\.0\.0\.1|localhost/i.test(url) && !/openai\.com/i.test(url);
}

export function ollamaIsCloud(baseUrl: string, apiKey?: string) {
  if (/ollama\.com/i.test(baseUrl)) return true;
  return Boolean(apiKey) && !/11434|127\.0\.0\.1|localhost/i.test(baseUrl);
}

function ollamaBaseUrl(slice: LlmEnvSlice) {
  if (slice.OLLAMA_BASE_URL) return withOpenAiV1(slice.OLLAMA_BASE_URL);
  if (slice.OLLAMA_HOST) return withOpenAiV1(slice.OLLAMA_HOST);
  if (slice.OLLAMA_API_KEY) return OLLAMA_CLOUD;
  return OLLAMA_LOCAL;
}

function pickName(slice: LlmEnvSlice): LlmProviderName | null {
  if (slice.LLM_PROVIDER === "openai") return slice.OPENAI_API_KEY ? "openai" : null;
  if (slice.LLM_PROVIDER === "ollama") return "ollama";
  if (slice.OLLAMA_API_KEY || slice.OLLAMA_BASE_URL || slice.OLLAMA_HOST) return "ollama";
  if (looksLikeOllama(slice.OPENAI_BASE_URL) && (slice.OPENAI_API_KEY || slice.OLLAMA_API_KEY)) return "ollama";
  if (slice.OPENAI_API_KEY) return "openai";
  return null;
}

export function resolveLlmRuntime(slice: LlmEnvSlice): LlmRuntime | null {
  const name = pickName(slice);
  if (!name) return null;

  if (name === "openai") {
    if (!slice.OPENAI_API_KEY) return null;
    return {
      name: "openai",
      host: "openai",
      baseUrl: stripSlash(slice.OPENAI_BASE_URL),
      apiKey: slice.OPENAI_API_KEY,
      model: slice.OPENAI_MODEL,
      embeddingModel: slice.OPENAI_EMBEDDING_MODEL,
      chatTimeoutMs: 28_000,
      sendOpenAiPenalties: true,
      supportsTools: true
    };
  }

  const baseUrl = ollamaBaseUrl(slice);
  const cloud = ollamaIsCloud(baseUrl, slice.OLLAMA_API_KEY);
  const apiKey = slice.OLLAMA_API_KEY || (cloud ? undefined : slice.OPENAI_API_KEY || "ollama");
  if (cloud && !slice.OLLAMA_API_KEY) return null;

  return {
    name: "ollama",
    host: cloud ? "ollama-cloud" : "ollama-local",
    baseUrl,
    apiKey,
    model: slice.OLLAMA_MODEL || (cloud ? "gpt-oss:20b" : "llama3.1"),
    embeddingModel: slice.OLLAMA_EMBEDDING_MODEL || "nomic-embed-text",
    chatTimeoutMs: cloud ? 45_000 : 90_000,
    sendOpenAiPenalties: false,
    supportsTools: true
  };
}

export function llmRuntimeLabel(runtime: LlmRuntime | null) {
  if (!runtime) return "motor local";
  if (runtime.host === "ollama-cloud") return `Llama · Ollama Cloud (${runtime.model})`;
  if (runtime.host === "ollama-local") return `Llama · Ollama (${runtime.model})`;
  return `OpenAI (${runtime.model})`;
}
