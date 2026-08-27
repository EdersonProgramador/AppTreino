import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { stitchContext } from "./context.js";
import { cosine, lexicalEmbed } from "./embeddings.js";
import { inspectGuardrails } from "./guardrails.js";
import { perceive } from "./perceive.js";
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

  it("não dispara tool em pedido curto", () => {
    const plan = planTurn([{ role: "user", content: "Oi, responde em uma frase." }]);
    assert.equal(plan.kind, "interactive");
    assert.equal(plan.useTools, false);
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

describe("perception", () => {
  it("marca follow-up e restrições da pergunta atual", () => {
    const seen = perceive([
      { role: "user", content: "Tô sem tempo hoje" },
      { role: "assistant", content: "Faz 18 min em casa." },
      { role: "user", content: "E se eu só tiver 10 minutos? Responde em uma frase." }
    ]);
    assert.equal(seen.isFollowUp, true);
    assert.match(seen.question, /10 minutos/);
    assert.ok(seen.constraints.includes("pouco tempo"));
    assert.ok(seen.constraints.includes("resposta curta"));
    assert.match(seen.threadBrief, /Pergunta atual/);
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

  it("reescreve menu genérico quando a pergunta era específica", () => {
    const ctx = {
      name: "Aluno Teste",
      objective: "Hipertrofia",
      level: "Intermediario",
      daysPerWeek: 4,
      equipmentTags: [] as string[],
      biotype: "mesomorfo" as const,
      biotypeReason: "IMC na faixa",
      streakDays: 4,
      sportTotals: { WORKOUT: 2, RUN: 1, WALK: 0, RIDE: 0 }
    };
    const history = [{ role: "user" as const, content: "Tô sem tempo hoje, o que dá pra fazer?" }];
    const out = reflectOnReply(
      "Quer treinar hoje, organizar a semana ou falar de comida?",
      history[0].content,
      { kind: "interactive", pattern: "react", steps: [], useTools: false, persistPlan: false },
      { ctx, history, perception: perceive(history) }
    );
    assert.ok(out.notes.some((note) => /genérica/.test(note)));
    assert.match(out.reply, /sem tempo|18 min|Pouco tempo/i);
    assert.doesNotMatch(out.reply, /organizar a semana/i);
  });
});
