import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { stitchContext } from "./context.js";
import { cosine, lexicalEmbed } from "./embeddings.js";
import { inspectGuardrails } from "./guardrails.js";
import { planTurn } from "./planner.js";
import { reflectOnReply } from "./reflect.js";

describe("planner tipos de agente", () => {
  it("classifica cumprimento como interactive", () => {
    const plan = planTurn([{ role: "user", content: "oi" }]);
    assert.equal(plan.kind, "interactive");
    assert.equal(plan.useTools, false);
    assert.equal(plan.persistPlan, false);
  });

  it("classifica dieta como task", () => {
    const plan = planTurn([{ role: "user", content: "Como eu como nessa semana?" }]);
    assert.equal(plan.kind, "task");
    assert.deepEqual(plan.steps, ["montar_dieta_biotipo"]);
  });

  it("classifica treino+dieta como goal plan-and-execute", () => {
    const plan = planTurn([{ role: "user", content: "Monta treino e dieta da semana" }]);
    assert.equal(plan.kind, "goal");
    assert.equal(plan.pattern, "plan-execute");
  });

  it("classifica faz sozinho como autonomous", () => {
    const plan = planTurn([{ role: "user", content: "Pode decidir por mim, faz sozinho." }]);
    assert.equal(plan.kind, "autonomous");
    assert.equal(plan.pattern, "plan-execute");
  });
});

describe("guardrails", () => {
  it("bloqueia pedido médico agudo", () => {
    const hit = inspectGuardrails("Estou com dor no peito agora");
    assert.ok(hit);
    assert.equal(hit?.reason, "medical");
  });

  it("bloqueia abuso de substância", () => {
    const hit = inspectGuardrails("Quero um ciclo de anabolizante");
    assert.ok(hit);
    assert.equal(hit?.reason, "abuse");
  });
});

describe("contexto e embeddings", () => {
  it("faz pruning do cumprimento e stitching da memória", () => {
    const stitched = stitchContext(
      [
        { role: "assistant", content: "E aí." },
        { role: "user", content: "oi" }
      ],
      ["Coach humano: não recitar ficha."]
    );
    assert.equal(stitched.history.length, 1);
    assert.match(stitched.memoryBlock, /não recitar ficha/);
  });

  it("recupera texto parecido via cosine lexical", () => {
    const a = lexicalEmbed("treino de perna hipertrofia");
    const b = lexicalEmbed("treino pernas hipertrofia");
    const c = lexicalEmbed("receita de bolo de chocolate");
    assert.ok(cosine(a, b) > cosine(a, c));
  });
});

describe("reflection", () => {
  it("corrige recap de ficha", () => {
    const out = reflectOnReply(
      "Aluno, estou no seu contexto: objetivo hipertrofia. Bora treinar.",
      "oi",
      { kind: "interactive", pattern: "react", steps: [], useTools: false, persistPlan: false }
    );
    assert.ok(out.notes.length > 0);
    assert.doesNotMatch(out.reply, /estou no seu contexto/i);
  });
});
