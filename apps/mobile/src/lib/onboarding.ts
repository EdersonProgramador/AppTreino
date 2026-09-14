import { formatCpf, isValidCpf, onlyDigits } from "./cpf";

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
export type BillingPreference = "UNDEFINED" | "PIX" | "CREDIT_CARD";

export type OnboardingFormValues = {
  name: string;
  email: string;
  phone: string;
  document: string;
  password: string;
  gender: "MALE" | "FEMALE" | "";
  birthYear: string;
  goal: TrainingGoal;
  daysPerWeek: "3" | "4" | "5" | "6";
  level: TrainingLevel;
  equipment: EquipmentTag[];
  billingType: BillingPreference;
  acceptTerms: boolean;
  acceptPrivacy: boolean;
};

export type OnboardingSubmitPayload = OnboardingFormValues & {
  birthDate: string;
  objective: string;
  daysPerWeekNumber: number;
};

export function goalLabel(goal: TrainingGoal) {
  return TRAINING_GOALS.find((item) => item.id === goal)?.label ?? goal;
}

export function levelLabel(level: TrainingLevel) {
  return TRAINING_LEVELS.find((item) => item.id === level)?.label ?? level;
}

export function birthDateFromYear(birthYear: string) {
  return `${birthYear}-01-01`;
}

export function suggestProgramBlurb(values: Pick<OnboardingFormValues, "goal" | "level" | "daysPerWeek" | "gender">) {
  const audience = values.gender === "FEMALE" ? "feminino" : "masculino";
  return `Com base no seu perfil (${levelLabel(values.level).toLowerCase()}, ${values.daysPerWeek}x/semana, foco em ${goalLabel(values.goal).toLowerCase()}), liberaremos os treinos publicados da academia para o público ${audience}.`;
}

export function defaultOnboardingValues(): OnboardingFormValues {
  return {
    name: "",
    email: "",
    phone: "",
    document: "",
    password: "",
    gender: "",
    birthYear: "",
    goal: "hypertrophy",
    daysPerWeek: "4",
    level: "beginner",
    equipment: ["gym"],
    billingType: "UNDEFINED",
    acceptTerms: false,
    acceptPrivacy: false
  };
}

function isValidBirthYear(value: string) {
  if (!/^\d{4}$/.test(value)) return false;
  const year = Number(value);
  const current = new Date().getFullYear();
  return year >= current - 100 && year <= current - 12;
}

export function validateOnboardingStep(step: 1 | 2 | 3 | 4, values: OnboardingFormValues): Record<string, string> {
  const errors: Record<string, string> = {};

  if (step === 1) {
    if (values.name.trim().length < 2) errors.name = "Informe seu nome";
    if (!values.email.trim() && !values.phone.trim()) errors.email = "Informe e-mail ou telefone";
    if (values.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.email.trim())) {
      errors.email = "E-mail inválido";
    }
    if (values.phone.trim() && values.phone.replace(/\D/g, "").length < 8) {
      errors.phone = "Telefone inválido";
    }
    if (!isValidCpf(values.document)) {
      errors.document =
        onlyDigits(values.document).length === 0
          ? "Informe os 11 dígitos do CPF"
          : "CPF inválido";
    }
    if (values.password.length < 6) errors.password = "Mínimo de 6 caracteres";
  }

  if (step === 2) {
    if (!values.gender) errors.gender = "Selecione o sexo";
    if (!isValidBirthYear(values.birthYear)) errors.birthYear = "Informe um ano de nascimento válido";
    if (!values.goal) errors.goal = "Selecione um objetivo";
    if (!values.daysPerWeek) errors.daysPerWeek = "Selecione a frequência";
  }

  if (step === 3) {
    if (!values.level) errors.level = "Selecione seu nível";
    if (!values.equipment.length) errors.equipment = "Selecione ao menos um equipamento";
  }

  if (step === 4) {
    if (!values.acceptTerms) errors.acceptTerms = "Aceite os Termos de Uso para continuar.";
    if (!values.acceptPrivacy) errors.acceptPrivacy = "Aceite a Política de Privacidade para continuar.";
  }

  return errors;
}

export { formatCpf, isValidCpf };
