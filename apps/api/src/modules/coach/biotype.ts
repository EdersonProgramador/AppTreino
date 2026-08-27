import type { Biotype } from "./types.js";

export function inferBiotype(input: {
  weightKg?: number | null;
  heightCm?: number | null;
  bodyFatPct?: number | null;
  waistCm?: number | null;
  hipCm?: number | null;
}): { biotype: Biotype; reason: string; bmi: number | null } {
  const heightM = input.heightCm && input.heightCm > 0 ? input.heightCm / 100 : null;
  const bmi = heightM && input.weightKg ? input.weightKg / (heightM * heightM) : null;
  const fat = input.bodyFatPct ?? null;
  const whr =
    input.waistCm && input.hipCm && input.hipCm > 0 ? input.waistCm / input.hipCm : null;

  if ((bmi != null && bmi < 18.8) || (fat != null && fat < 12)) {
    return {
      biotype: "ectomorfo",
      reason: bmi != null ? `IMC ${bmi.toFixed(1)} — estrutura magra, priorize superávit e força.` : "Percentual baixo — perfil ectomorfo.",
      bmi
    };
  }
  if ((bmi != null && bmi >= 26) || (fat != null && fat >= 24) || (whr != null && whr >= 0.9)) {
    return {
      biotype: "endomorfo",
      reason: bmi != null ? `IMC ${bmi.toFixed(1)} — mais fácil acumular energia; déficit leve e NEAT alto.` : "Adiposidade relativa mais alta — perfil endomorfo.",
      bmi
    };
  }
  return {
    biotype: "mesomorfo",
    reason: bmi != null ? `IMC ${bmi.toFixed(1)} — boa resposta a treino; recomp ou superávit pequeno.` : "Sem medidas recentes; assumimos mesomorfo até a próxima avaliação.",
    bmi
  };
}

export function estimateKcal(input: {
  weightKg?: number | null;
  heightCm?: number | null;
  gender?: string | null;
  biotype: Biotype;
  objective: string;
}) {
  const weight = input.weightKg && input.weightKg > 30 ? input.weightKg : 70;
  const height = input.heightCm && input.heightCm > 120 ? input.heightCm : 170;
  const female = input.gender === "FEMALE";
  const bmr = female ? 10 * weight + 6.25 * height - 161 : 10 * weight + 6.25 * height + 5;
  const tdee = Math.round(bmr * 1.45);
  const objective = input.objective.toLowerCase();
  const cut = /emagrec|definic|perda|cut/.test(objective);
  const bulk = /hipertrof|ganho|massa|bulk/.test(objective);
  let delta = 0;
  if (cut) delta = input.biotype === "endomorfo" ? -450 : -300;
  else if (bulk) delta = input.biotype === "ectomorfo" ? 380 : 220;
  else if (input.biotype === "ectomorfo") delta = 180;
  else if (input.biotype === "endomorfo") delta = -180;
  return Math.max(1400, tdee + delta);
}