import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { llmRuntimeLabel, resolveLlmRuntime, type LlmEnvSlice } from "./provider.js";

const openai: LlmEnvSlice = {
  LLM_PROVIDER: "auto",
  OPENAI_API_KEY: "sk-test",
  OPENAI_BASE_URL: "https://api.openai.com/v1",
  OPENAI_MODEL: "gpt-4o-mini",
  OPENAI_EMBEDDING_MODEL: "text-embedding-3-small",
  OLLAMA_EMBEDDING_MODEL: "nomic-embed-text"
};

describe("resolveLlmRuntime", () => {
  it("usa OpenAI quando só a chave OpenAI existe", () => {
    const runtime = resolveLlmRuntime(openai);
    assert.equal(runtime?.host, "openai");
    assert.equal(runtime?.model, "gpt-4o-mini");
    assert.equal(runtime?.sendOpenAiPenalties, true);
  });

  it("prioriza Ollama Cloud (Llama) quando há OLLAMA_API_KEY", () => {
    const runtime = resolveLlmRuntime({ ...openai, OLLAMA_API_KEY: "ollama-key" });
    assert.equal(runtime?.name, "ollama");
    assert.equal(runtime?.host, "ollama-cloud");
    assert.equal(runtime?.baseUrl, "https://ollama.com/v1");
    assert.equal(runtime?.model, "llama3.3");
    assert.equal(runtime?.sendOpenAiPenalties, false);
    assert.match(llmRuntimeLabel(runtime), /Ollama Cloud/);
  });

  it("aponta para Ollama local sem chave", () => {
    const runtime = resolveLlmRuntime({
      ...openai,
      OPENAI_API_KEY: undefined,
      LLM_PROVIDER: "ollama",
      OLLAMA_HOST: "http://127.0.0.1:11434"
    });
    assert.equal(runtime?.host, "ollama-local");
    assert.equal(runtime?.baseUrl, "http://127.0.0.1:11434/v1");
    assert.equal(runtime?.model, "llama3.1");
  });

  it("respeita OLLAMA_MODEL na cloud", () => {
    const runtime = resolveLlmRuntime({
      ...openai,
      OLLAMA_API_KEY: "ollama-key",
      OLLAMA_MODEL: "llama4:scout"
    });
    assert.equal(runtime?.model, "llama4:scout");
  });

  it("não sobe Ollama Cloud sem chave", () => {
    const runtime = resolveLlmRuntime({
      ...openai,
      OPENAI_API_KEY: undefined,
      LLM_PROVIDER: "ollama",
      OLLAMA_BASE_URL: "https://ollama.com/v1"
    });
    assert.equal(runtime, null);
  });

  it("força OpenAI mesmo com chave Ollama", () => {
    const runtime = resolveLlmRuntime({
      ...openai,
      LLM_PROVIDER: "openai",
      OLLAMA_API_KEY: "ollama-key"
    });
    assert.equal(runtime?.host, "openai");
  });
});
