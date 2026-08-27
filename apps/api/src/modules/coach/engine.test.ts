import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { localCoachChat } from "./engine.js";
import { conversationForModel } from "./llm.js";
import type { CoachContext } from "./types.js";

const ctx: CoachContext = {
  name: "Aluno Teste",
  objective: "Hipertrofia",
  level: "Intermediario",
  daysPerWeek: 4,
  equipmentTags: [],
  biotype: "mesomorfo",
  biotypeReason: "IMC na faixa",
  streakDays: 4,
  sportTotals: { WORKOUT: 2, RUN: 1, WALK: 0, RIDE: 0 }
};

describe("localCoachChat tom humano", () => {
  it("não recita a ficha num oi", () => {
    const result = localCoachChat(ctx, [{ role: "user", content: "oi" }]);
    assert.equal(result.source, "local");
    assert.match(result.reply, /E aí, Aluno/);
    assert.doesNotMatch(result.reply, /estou no seu contexto/i);
    assert.doesNotMatch(result.reply, /objetivo Hipertrofia/i);
  });

  it("não trata pedido real como cumprimento", () => {
    const result = localCoachChat(ctx, [{ role: "user", content: "Oi, responde em uma frase." }]);
    assert.doesNotMatch(result.reply, /estou no seu contexto/i);
    assert.doesNotMatch(result.reply, /^E aí, Aluno\./);
  });
});

describe("conversationForModel", () => {
  it("remove o cumprimento automático do app", () => {
    const next = conversationForModel([
      {
        role: "assistant",
        content: "E aí, Aluno. Tô por aqui. Quer treinar hoje, organizar a semana ou falar de comida?"
      },
      { role: "user", content: "oi" }
    ]);
    assert.equal(next.length, 1);
    assert.equal(next[0]?.content, "oi");
  });
});
