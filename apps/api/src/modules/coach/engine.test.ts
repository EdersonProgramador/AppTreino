import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { localCoachChat } from "./engine.js";
import { conversationForModel, coachMessageText } from "./llm.js";
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
    assert.doesNotMatch(result.reply, /semana ou (a |falar de )?comida/i);
    assert.match(result.reply, /em uma frase/i);
  });

  it("cita a pergunta em vez de oferecer menu", () => {
    const result = localCoachChat(ctx, [{ role: "user", content: "Como eu durmo melhor pra recuperar?" }]);
    assert.match(result.reply, /Como eu durmo melhor/i);
    assert.doesNotMatch(result.reply, /organizar a semana/i);
    assert.doesNotMatch(result.reply, /treino de hoje, a semana/i);
  });

  it("amarra follow-up no turno anterior", () => {
    const result = localCoachChat(ctx, [
      { role: "user", content: "Tô sem tempo hoje" },
      { role: "assistant", content: "Faz 18 min: agachamento, flexão e prancha." },
      { role: "user", content: "E se eu só tiver 10 minutos?" }
    ]);
    assert.match(result.reply, /10 minutos/i);
    assert.match(result.reply, /continuação/i);
    assert.doesNotMatch(result.reply, /organizar a semana/i);
  });
});

describe("conversationForModel", () => {
  it("remove o cumprimento automático do app", () => {
    const next = conversationForModel([
      {
        role: "assistant",
        content: "E aí, Aluno. Me conta o que tá acontecendo hoje no treino ou na rotina — eu respondo em cima da sua pergunta."
      },
      { role: "user", content: "oi" }
    ]);
    assert.equal(next.length, 1);
    assert.equal(next[0]?.content, "oi");
  });

  it("não deixa menu genérico no histórico", () => {
    const next = conversationForModel([
      { role: "user", content: "oi" },
      {
        role: "assistant",
        content: "Quer treinar hoje, organizar a semana ou falar de comida?"
      },
      { role: "user", content: "Tô sem tempo hoje" }
    ]);
    assert.equal(next.length, 2);
    assert.equal(next[0]?.content, "oi");
    assert.equal(next[1]?.content, "Tô sem tempo hoje");
  });
});

describe("coachMessageText", () => {
  it("lê texto em array no estilo gpt-oss", () => {
    assert.equal(coachMessageText({ content: "ok" }), "ok");
    assert.equal(coachMessageText({ content: [{ type: "text", text: "Faz 18 min." }] }), "Faz 18 min.");
  });
});
