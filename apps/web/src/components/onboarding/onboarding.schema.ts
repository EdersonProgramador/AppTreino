import { z } from "zod";
import { getCpfValidationMessage, normalizeCpfDigits, resolveCpfValidationState } from "@app-treino/shared";

export const TRAINING_GOALS = [
  { id: "hypertrophy", label: "Ganhar massa muscular (hipertrofia)" },
  { id: "fat_loss", label: "Perder gordura / definição" },
  { id: "conditioning", label: "Condicionamento físico" }
] as const;

export const TRAINING_LEVELS = [
  { id: "beginner", label: "Iniciante", desc: "Pouca ou nenhuma experiência prévia" },
  { id: "intermediate", label: "Intermediário", desc: "Já treina há alguns meses" },
  { id: "advanced", label: "Avançado", desc: "Treina há anos e domina a execução" }
] as const;

export const EQUIPMENT_OPTIONS = [
  { id: "gym", label: "Academia completa" },
  { id: "dumbbells", label: "Halteres / anilhas" },
  { id: "bodyweight", label: "Peso corporal" },
  { id: "bands", label: "Elásticos / bands" }
] as const;

export type TrainingGoal = (typeof TRAINING_GOALS)[number]["id"];
export type TrainingLevel = (typeof TRAINING_LEVELS)[number]["id"];
export type EquipmentTag = (typeof EQUIPMENT_OPTIONS)[number]["id"];

const registerDocumentSchema = z
  .string()
  .trim()
  .superRefine((value, ctx) => {
    const state = resolveCpfValidationState(value);
    if (state === "valid") return;
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: getCpfValidationMessage(state, normalizeCpfDigits(value).length)
    });
  });

export const onboardingSchema = z
  .object({
    name: z.string().trim().min(2, "Informe seu nome"),
    email: z.string().trim().email("E-mail inválido").optional().or(z.literal("")),
    phone: z.string().trim().min(8, "Telefone inválido").optional().or(z.literal("")),
    document: z.string().trim().optional().or(z.literal("")),
    password: z.string().min(6, "Mínimo de 6 caracteres").optional().or(z.literal("")),
    gender: z.enum(["MALE", "FEMALE"], {
      required_error: "Selecione o sexo",
      invalid_type_error: "Selecione o sexo"
    }),
    birthYear: z
      .string()
      .min(4, "Informe o ano de nascimento")
      .regex(/^\d{4}$/, "Ano inválido")
      .refine((value) => {
        const year = Number(value);
        const current = new Date().getFullYear();
        return year >= current - 100 && year <= current - 12;
      }, "Informe um ano de nascimento válido"),
    goal: z.enum(["hypertrophy", "fat_loss", "conditioning"], {
      required_error: "Selecione um objetivo"
    }),
    daysPerWeek: z.enum(["3", "4", "5", "6"], {
      required_error: "Selecione a frequência"
    }),
    level: z.enum(["beginner", "intermediate", "advanced"], {
      required_error: "Selecione seu nível"
    }),
    equipment: z.array(z.enum(["gym", "dumbbells", "bodyweight", "bands"])).min(1, "Selecione ao menos um equipamento"),
    billingType: z.enum(["UNDEFINED", "PIX", "CREDIT_CARD"]).optional().default("UNDEFINED"),
    acceptTerms: z.boolean().optional(),
    acceptPrivacy: z.boolean().optional()
  })
  .superRefine((data, ctx) => {
    if (!data.email && !data.phone) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Informe e-mail ou telefone",
        path: ["email"]
      });
    }
  });

export const registerOnboardingSchema = onboardingSchema
  .merge(
    z.object({
      document: registerDocumentSchema
    })
  )
  .superRefine((data, ctx) => {
  if (!data.password || data.password.length < 6) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Mínimo de 6 caracteres",
      path: ["password"]
    });
  }
  if (!data.acceptTerms) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Aceite os Termos de Uso para continuar.",
      path: ["acceptTerms"]
    });
  }
  if (!data.acceptPrivacy) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Aceite a Política de Privacidade para continuar.",
      path: ["acceptPrivacy"]
    });
  }
});

export type OnboardingFormValues = z.infer<typeof onboardingSchema>;

export const ONBOARDING_STEP_FIELDS: Record<1 | 2 | 3 | 4, Array<keyof OnboardingFormValues>> = {
  1: ["name", "email", "phone", "password"],
  2: ["gender", "birthYear", "goal", "daysPerWeek"],
  3: ["level", "equipment"],
  4: ["acceptTerms", "acceptPrivacy"]
};

export const REGISTER_ONBOARDING_STEP_FIELDS: Record<1 | 2 | 3 | 4, Array<keyof OnboardingFormValues>> = {
  1: ["name", "email", "phone", "document", "password"],
  2: ["gender", "birthYear", "goal", "daysPerWeek"],
  3: ["level", "equipment"],
  4: ["acceptTerms", "acceptPrivacy"]
};

export function goalLabel(goal: TrainingGoal) {
  return TRAINING_GOALS.find((item) => item.id === goal)?.label ?? goal;
}

export function levelLabel(level: TrainingLevel) {
  return TRAINING_LEVELS.find((item) => item.id === level)?.label ?? level;
}

export function suggestProgramBlurb(values: Pick<OnboardingFormValues, "goal" | "level" | "daysPerWeek" | "gender">) {
  const audience = values.gender === "FEMALE" ? "feminino" : "masculino";
  return `Com base no seu perfil (${levelLabel(values.level).toLowerCase()}, ${values.daysPerWeek}x/semana, foco em ${goalLabel(values.goal).toLowerCase()}), liberaremos os treinos publicados da academia para o público ${audience}.`;
}

export function birthDateFromYear(birthYear: string) {
  return `${birthYear}-01-01`;
}
