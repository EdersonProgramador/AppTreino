import { estimateKcal } from "./biotype.js";
import type { Biotype, CoachContext, CoachDay, CoachPlan, CoachChatResult, DietPlan } from "./types.js";

const MODALITIES = [
  "Musculação",
  "Funcional",
  "HIIT",
  "Corrida",
  "Caminhada",
  "Ciclismo",
  "Cross",
  "Yoga/Mobilidade"
] as const;

function setsFor(level: string) {
  const value = level.toLowerCase();
  if (value.includes("avanc")) return 4;
  if (value.includes("inter")) return 3;
  return 2;
}

function restFor(level: string, kind: "strength" | "cond") {
  if (kind === "cond") return 30;
  return level.toLowerCase().includes("avanc") ? 90 : 60;
}

function outdoorByWeather(ctx: CoachContext): "Corrida" | "Caminhada" | "HIIT" {
  const code = ctx.weather?.code ?? 0;
  const temp = ctx.weather?.tempC;
  if (code >= 80 || (temp != null && temp >= 34)) return "HIIT";
  if (ctx.objective.toLowerCase().includes("emagrec") || ctx.biotype === "endomorfo") return "Caminhada";
  return "Corrida";
}

export function buildDiet(ctx: CoachContext, goal?: "cut" | "bulk" | "recomp"): DietPlan {
  const kcal = estimateKcal({
    weightKg: ctx.weightKg,
    heightCm: ctx.heightCm,
    gender: ctx.gender,
    biotype: ctx.biotype,
    objective: goal ?? ctx.objective
  });
  const weight = ctx.weightKg && ctx.weightKg > 30 ? ctx.weightKg : 70;
  const proteinG = Math.round(weight * (ctx.biotype === "ectomorfo" ? 1.8 : 2.1));
  const fatG = Math.round(weight * (ctx.biotype === "endomorfo" ? 0.7 : 0.9));
  const carbsG = Math.max(80, Math.round((kcal - proteinG * 4 - fatG * 9) / 4));

  const meals: DietPlan["meals"] =
    ctx.biotype === "ectomorfo"
      ? [
          { name: "Café", items: ["Aveia + leite", "Ovos mexidos", "Banana", "Pasta de amendoim"] },
          { name: "Lanche", items: ["Iogurte grego", "Granola", "Fruta"] },
          { name: "Almoço", items: ["Arroz", "Frango ou carne", "Feijão", "Salada de folhas"] },
          { name: "Pré-treino", items: ["Pão + atum ou frango", "Fruta"] },
          { name: "Jantar", items: ["Batata ou macarrão", "Peixe ou ovos", "Legumes"] }
        ]
      : ctx.biotype === "endomorfo"
        ? [
            { name: "Café", items: ["Ovos", "Fruta", "Café sem açúcar"] },
            { name: "Almoço", items: ["Proteína magra", "Legumes no vapor", "Salada grande", "Porção controlada de arroz"] },
            { name: "Lanche", items: ["Iogurte natural", "Castanhas (1 punhado)"] },
            { name: "Jantar", items: ["Peixe ou frango", "Salada", "Abóbora ou batata-doce pequena"] }
          ]
        : [
            { name: "Café", items: ["Ovos", "Aveia ou pão", "Fruta"] },
            { name: "Almoço", items: ["Proteína", "Carboidrato (arroz/batata)", "Salada e legumes"] },
            { name: "Lanche", items: ["Iogurte ou whey", "Fruta"] },
            { name: "Jantar", items: ["Proteína", "Legumes", "Carboidrato menor que o almoço"] }
          ];

  const strategy =
    ctx.biotype === "ectomorfo"
      ? "Superávit calórico, carboidrato alto, 4–5 refeições. Não pule o pós-treino."
      : ctx.biotype === "endomorfo"
        ? "Déficit leve, proteína alta, caminhada diária e sono 7h+. Evite líquido calórico."
        : "Recomposição: proteína alta, carboidrato em volta do treino, consistência > perfeição.";

  return {
    biotype: ctx.biotype,
    kcal,
    proteinG,
    carbsG,
    fatG,
    strategy,
    meals,
    notes: [
      ctx.biotypeReason,
      "Ajuste ±150 kcal após 14 dias se o peso não andar na direção do objetivo.",
      "Beba água ao longo do dia; não use a dieta para compensar treino perdido."
    ]
  };
}

function strengthDay(title: string, focus: string, names: string[], ctx: CoachContext): CoachDay {
  const sets = setsFor(ctx.level);
  const rest = restFor(ctx.level, "strength");
  return {
    title,
    focus,
    modality: "Musculação",
    exercises: names.map((name, index) => ({
      name,
      sets: index === names.length - 1 ? Math.max(2, sets - 1) : sets,
      reps: index === names.length - 1 ? "30-45s" : ctx.level.toLowerCase().includes("avanc") ? "6-10" : "8-12",
      restSeconds: rest
    }))
  };
}

export function buildWorkoutPlan(ctx: CoachContext): CoachPlan {
  const outdoor = outdoorByWeather(ctx);
  const days: CoachDay[] = [];
  const push = strengthDay("Push · peito ombro tríceps", ctx.objective, ["Supino reto", "Desenvolvimento", "Crucifixo", "Tríceps testa", "Prancha"], ctx);
  const pull = strengthDay("Pull · costas bíceps", ctx.objective, ["Puxada alta", "Remada curvada", "Face pull", "Rosca direta", "Dead bug"], ctx);
  const legs = strengthDay("Pernas · posterior e quadríceps", ctx.objective, ["Agachamento", "Levantamento terra romeno", "Afundo", "Panturrilha", "Core anti-rotação"], ctx);
  const fullA = strengthDay("Full body A", ctx.objective, ["Agachamento", "Supino", "Remada", "Prancha"], ctx);
  const fullB = strengthDay("Full body B", ctx.objective, ["Levantamento terra romeno", "Desenvolvimento", "Puxada", "Farmer walk"], ctx);
  const hiit: CoachDay = {
    title: "HIIT indoor",
    focus: "Condicionamento quando o clima pesa",
    modality: "HIIT",
    exercises: [
      { name: "Aquecimento articulações", sets: 1, reps: "4 min", restSeconds: 0 },
      { name: "Burpee ou mountain climber", sets: 8, reps: "20s on / 10s off", restSeconds: 10 },
      { name: "Agachamento jump ou step-up", sets: 6, reps: "30s", restSeconds: 20 },
      { name: "Core (prancha + hollow)", sets: 3, reps: "40s", restSeconds: 20 }
    ]
  };
  const yoga: CoachDay = {
    title: "Yoga / mobilidade",
    focus: "Recuperação e amplitude",
    modality: "Yoga/Mobilidade",
    exercises: [
      { name: "Respiração 4-7-8", sets: 4, reps: "1 min", restSeconds: 0 },
      { name: "Gato-vaca + world greatest stretch", sets: 3, reps: "8/lado", restSeconds: 20 },
      { name: "Pigeon / 90-90", sets: 2, reps: "60s/lado", restSeconds: 15 },
      { name: "Savasana", sets: 1, reps: "4 min", restSeconds: 0 }
    ]
  };
  const cardio: CoachDay = {
    title: outdoor,
    focus: outdoor === "HIIT" ? "Cardio indoor pelo clima" : `${outdoor} contínua + técnica`,
    modality: outdoor,
    exercises:
      outdoor === "Caminhada"
        ? [
            { name: "Caminhada zona 2", sets: 1, reps: "35-50 min", restSeconds: 0 },
            { name: "Alongamento panturrilha/quadril", sets: 2, reps: "40s", restSeconds: 15 }
          ]
        : outdoor === "Corrida"
          ? [
              { name: "Aquecimento caminhando", sets: 1, reps: "5 min", restSeconds: 0 },
              { name: "Corrida fácil", sets: 1, reps: "20-35 min", restSeconds: 0 },
              { name: "4x 30s mais rápido", sets: 4, reps: "30s", restSeconds: 90 }
            ]
          : hiit.exercises
  };
  const ride: CoachDay = {
    title: "Pedal",
    focus: "Base aeróbica",
    modality: "Ciclismo",
    exercises: [
      { name: "Pedal cadência estável", sets: 1, reps: "40-60 min", restSeconds: 0 },
      { name: "3x 2 min mais forte", sets: 3, reps: "2 min", restSeconds: 120 }
    ]
  };

  if (ctx.daysPerWeek <= 3) days.push(fullA, cardio, fullB);
  else if (ctx.daysPerWeek === 4) days.push(push, cardio, pull, legs);
  else if (ctx.daysPerWeek === 5) days.push(push, pull, cardio, legs, yoga);
  else days.push(push, pull, legs, cardio, ride, yoga);

  const diet = buildDiet(ctx);
  const rainNote =
    ctx.weather && (ctx.weather.code ?? 0) >= 80
      ? `Clima agora: ${ctx.weather.label ?? "chuva"}. Cardio indoor no lugar da rua.`
      : ctx.weather
        ? `Clima agora: ${ctx.weather.tempC}° · ${ctx.weather.label ?? "ok"}. Outdoor liberado se o corpo pedir.`
        : "Use o chip de clima no treino/corrida para ajustar o cardio do dia.";

  return {
    summary: `Semana ${ctx.daysPerWeek}x para ${ctx.objective} (${ctx.level}), biotipo ${ctx.biotype}. Mix de ${[...new Set(days.map((day) => day.modality))].join(", ")}.`,
    days: days.slice(0, ctx.daysPerWeek),
    recommendations: [
      rainNote,
      ctx.streakDays > 0
        ? `Ofensiva em ${ctx.streakDays} dia(s). Não quebre a sequência — o mínimo válido também conta.`
        : "Abra a ofensiva hoje: um treino curto já marca o dia.",
      "Registre carga. Se as últimas 2 séries ficarem fáceis, suba 2,5–5%.",
      `Dieta alinhada ao biotipo ${ctx.biotype}: ${diet.kcal} kcal · ${diet.proteinG}g proteína.`
    ],
    diet,
    modalities: [...new Set(days.map((day) => day.modality))]
  };
}

function lastUserText(messages: Array<{ role: string; content: string }>) {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    if (messages[i]?.role === "user") return messages[i].content.trim();
  }
  return "";
}

export function localCoachChat(ctx: CoachContext, messages: Array<{ role: string; content: string }>): CoachChatResult {
  const text = lastUserText(messages).toLowerCase();
  const first = ctx.name.split(" ")[0] || "atleta";
  const wantsDiet = /dieta|refei|comer|biotipo|ectomor|endomor|mesomor|prote[ií]na|kcal|card[aá]pio/.test(text);
  const wantsPlan = /treino|s[eé]rie|carga|muscul|hiit|yoga|for[cç]a|hipertrof|montar|gerar|semana|modalidade/.test(text);
  const wantsRun = /corrida|correr|pace|km |pedal|caminh/.test(text);
  const wantsStreak = /ofensiva|consist|sequ[eê]ncia|faltou|desânimo|desanimo/.test(text);

  if (wantsDiet && !wantsPlan) {
    const diet = buildDiet(ctx);
    return {
      source: "local",
      diet,
      reply: `${first}, pelo seu recorte (${ctx.biotypeReason}) você está no perfil **${diet.biotype}**.\n\n${diet.strategy}\nAlvo: ${diet.kcal} kcal · ${diet.proteinG}g proteína · ${diet.carbsG}g carbo · ${diet.fatG}g gordura.\n\n${diet.meals.map((meal) => `• ${meal.name}: ${meal.items.join(", ")}`).join("\n")}\n\nIsso é ponto de partida clínico-prático, não prescrição médica.`
    };
  }

  if (wantsPlan || wantsRun || /hoje|agora|bora treinar|montar/.test(text)) {
    const plan = buildWorkoutPlan(ctx);
    const diet = plan.diet;
    return {
      source: "local",
      plan,
      diet,
      reply: `${first}, montei a semana com as modalidades do AppTreino (musculação, ${plan.days.map((day) => day.modality).filter((item, index, all) => all.indexOf(item) === index).join(", ")}).\n\n${plan.summary}\n\n${plan.days.map((day) => `• ${day.title}: ${day.exercises.map((item) => item.name).slice(0, 3).join(", ")}`).join("\n")}\n\n${plan.recommendations[0]}\nBiotipo ${ctx.biotype}: dieta em ${diet?.kcal ?? "—"} kcal. Quer que eu foque só hipertrofia, só corrida ou emagrecimento?`
    };
  }

  if (wantsStreak) {
    return {
      source: "local",
      reply:
        ctx.streakDays > 0
          ? `${first}, você está com ${ctx.streakDays} dia(s) de ofensiva. O cérebro tenta negociar folga; o padrão vencedor é o mínimo inegociável de hoje. Marque o dia — treino, corrida, caminhada ou pedal.`
          : `${first}, a ofensiva está zerada. Não precisa do treino perfeito: 20 minutos já reabrem a sequência. Qual modalidade você consegue fazer nas próximas 2 horas?`
    };
  }

  return {
    source: "local",
    reply: `${first}, estou no seu contexto: objetivo ${ctx.objective}, nível ${ctx.level}, biotipo ${ctx.biotype}, ofensiva ${ctx.streakDays}d. Posso montar treino da semana (todas as modalidades), dieta pelo biotipo, ajustar carga ou sugerir o cardio pelo clima. O que você quer agora?`
  };
}

export function dietGoalFromText(text: string, fallback: string): "cut" | "bulk" | "recomp" {
  const value = `${text} ${fallback}`.toLowerCase();
  if (/emagrec|cut|definic|perda/.test(value)) return "cut";
  if (/hipertrof|massa|bulk|ganho/.test(value)) return "bulk";
  return "recomp";
}

export { MODALITIES };
export type { Biotype };