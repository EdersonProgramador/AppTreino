import { z } from "zod";

export const perimeterItemSchema = z.object({
  detalhe: z.string(),
  valor: z.number().nullable()
});

export const physicalAssessmentFormSchema = z.object({
  formulario_avaliacao_fisica: z.object({
    dados_pessoais_e_objetivos: z.object({
      nome_completo: z.string(),
      data_nascimento: z.string(),
      genero_biologico: z.object({ opcoes: z.array(z.string()), resposta: z.string() }),
      objetivo_principal: z.object({ opcoes: z.array(z.string()), resposta: z.string() }),
      nivel_atividade_atual: z.object({ opcoes: z.array(z.string()), resposta: z.string() })
    }),
    historico_de_saude_anamnese: z.object({
      possui_lesao: z.object({ descricao: z.string(), resposta: z.string() }),
      medicamento_continuo: z.object({ descricao: z.string(), resposta: z.string() }),
      restricao_medica_cardiaca: z.object({ descricao: z.string(), resposta: z.string() })
    }),
    composicao_corporal_basica: z.object({
      instrucao: z.string(),
      peso_atual_kg: z.number().nullable(),
      altura_cm: z.number().nullable()
    }),
    perimetros_corporais_cm: z.object({
      instrucao: z.string(),
      pescoço: perimeterItemSchema,
      torax: perimeterItemSchema,
      cintura: perimeterItemSchema,
      abdomen: perimeterItemSchema,
      quadril: perimeterItemSchema,
      braco_direito_relaxado: perimeterItemSchema,
      braco_esquerdo_relaxado: perimeterItemSchema,
      coxa_direita: perimeterItemSchema,
      coxa_esquerda: perimeterItemSchema,
      panturrilha_direita: perimeterItemSchema,
      panturrilha_esquerda: perimeterItemSchema
    }),
    fotos_analise_visual: z.object({
      instrucao: z.string(),
      arquivos: z.object({
        foto_frente: z.string(),
        foto_costas: z.string(),
        foto_perfil: z.string()
      })
    })
  })
});

export function calculateBodyFatEstimate(input: {
  gender: string;
  heightCm: number | null;
  neckCm: number | null;
  waistCm: number | null;
  hipCm: number | null;
  weightKg: number | null;
  birthDate?: string;
}) {
  const { gender, heightCm, neckCm, waistCm, hipCm } = input;
  const isMale = gender === "Masculino";
  const isFemale = gender === "Feminino";

  if (
    (!isMale && !isFemale) ||
    !heightCm ||
    !neckCm ||
    !waistCm ||
    heightCm <= 0 ||
    neckCm <= 0 ||
    waistCm <= 0
  ) {
    return null;
  }

  const log10 = Math.log10;

  if (isMale) {
    if (waistCm - neckCm > 0) {
      const bodyFat =
        495 / (1.0324 - 0.19077 * log10(waistCm - neckCm) + 0.15456 * log10(heightCm)) - 450;
      return Math.max(0, Math.min(100, Math.round(bodyFat * 10) / 10));
    }
  } else if (hipCm && hipCm > 0 && waistCm + hipCm - neckCm > 0) {
    const bodyFat =
      495 / (1.29579 - 0.35004 * log10(waistCm + hipCm - neckCm) + 0.221 * log10(heightCm)) - 450;
    return Math.max(0, Math.min(100, Math.round(bodyFat * 10) / 10));
  }

  const { weightKg, birthDate } = input;
  if (!weightKg || weightKg <= 0) return null;

  const bmi = weightKg / Math.pow(heightCm / 100, 2);
  let age = 0;
  if (birthDate) {
    const born = new Date(`${birthDate}T00:00:00`);
    if (!Number.isNaN(born.getTime())) {
      const today = new Date();
      age = today.getFullYear() - born.getFullYear();
      const monthDiff = today.getMonth() - born.getMonth();
      if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < born.getDate())) age -= 1;
    }
  }
  const bodyFat = 1.2 * bmi + 0.23 * age - 10.8 * (isMale ? 1 : 0) - 5.4;

  return Math.max(0, Math.min(100, Math.round(bodyFat * 10) / 10));
}
