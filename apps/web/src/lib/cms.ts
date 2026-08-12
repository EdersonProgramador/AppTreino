import type { AdminTrashKind, CmsProgramRow } from "../types/admin";
import type { TodayWorkoutResponse } from "../types/student";

export function getCmsProgramReadiness(program: CmsProgramRow) {
  const issues: string[] = [];

  if (!program.modality || !program.modality.isActive) {
    issues.push("Modalidade inativa ou ausente.");
  }

  if (program.days.length === 0) {
    issues.push("Cadastre ao menos um dia no ciclo.");
  }

  for (const day of program.days) {
    const block = day.workoutBlock;
    if (!block) {
      issues.push(`O dia ${day.dayNumber} está sem divisão.`);
      continue;
    }

    if ((block.exercises ?? []).length === 0) {
      issues.push(`A divisão "${block.title}" (dia ${day.dayNumber}) não possui exercícios.`);
    }
  }

  return {
    ready: issues.length === 0,
    issues
  };
}

export function trashResourceBase(kind: AdminTrashKind): string {
  return `/admin/trash/${kind}`;
}

export function trashSoftDeleteBase(kind: AdminTrashKind): string {
  const map: Record<AdminTrashKind, string> = {
    users: "/admin/users",
    workouts: "/admin/workouts",
    announcements: "/admin/cms/announcements",
    plans: "/admin/plans",
    memberships: "/admin/memberships",
    payments: "/admin/payments",
    assessments: "/admin/physical-assessments",
    events: "/admin/events",
    tickets: "/admin/support-tickets",
    aiPlans: "/admin/ai-workout-plans",
    products: "/admin/products",
    purchases: "/admin/purchases",
    cards: "/admin/payment-cards",
    favorites: "/admin/favorites",
    ratings: "/admin/ratings",
    contactMessages: "/admin/contact-messages",
    modalities: "/admin/cms/modalities",
    locations: "/admin/cms/locations",
    exercises: "/admin/cms/exercises",
    workoutBlocks: "/admin/cms/workout-blocks",
    programs: "/admin/cms/programs"
  };
  return map[kind];
}

export function trashKindLabel(kind: AdminTrashKind): string {
  const labels: Record<AdminTrashKind, string> = {
    users: "Usuários",
    workouts: "Treinos",
    announcements: "Avisos",
    plans: "Planos",
    memberships: "Matrículas",
    payments: "Pagamentos",
    assessments: "Avaliações físicas",
    events: "Eventos",
    tickets: "Atendimentos",
    aiPlans: "Planos IA",
    products: "Produtos",
    purchases: "Compras",
    cards: "Cartões",
    favorites: "Favoritos",
    ratings: "Avaliações",
    contactMessages: "Mensagens de contato",
    modalities: "Modalidades",
    locations: "Unidades",
    exercises: "Exercícios",
    workoutBlocks: "Divisões",
    programs: "Treinos"
  };
  return labels[kind];
}

export function parseProgramMetadata(description: string) {
  try {
    const parsed = JSON.parse(description) as { description?: string; modality?: string };

    return {
      description: parsed.description || description,
      modality: parsed.modality || "Hipertrofia"
    };
  } catch {
    return {
      description,
      modality: "Hipertrofia"
    };
  }
}

export function cmsProgramStatusLabel(status: CmsProgramRow["status"]) {
  switch (status) {
    case "PUBLISHED":
      return "Publicado";
    case "DRAFT":
      return "Rascunho";
    case "ARCHIVED":
      return "Arquivado";
    default:
      return status;
  }
}

export function cmsTargetGenderLabel(gender: CmsProgramRow["targetGender"]) {
  switch (gender) {
    case "MALE":
      return "Masculino";
    case "FEMALE":
      return "Feminino";
    default:
      return "Todos";
  }
}

export function estimateProgramCalendarDays(years: number, months: number, weeks: number, days: number) {
  return Math.max(0, years) * 365 + Math.max(0, months) * 30 + Math.max(0, weeks) * 7 + Math.max(0, days);
}

export function formatProgramDuration(duration?: TodayWorkoutResponse["workout"]["duration"]) {
  if (!duration) return "Duração não informada";
  const parts = [
    duration.years ? `${duration.years} ano(s)` : "",
    duration.months ? `${duration.months} mês(es)` : "",
    duration.weeks ? `${duration.weeks} semana(s)` : "",
    duration.days ? `${duration.days} dia(s)` : ""
  ].filter(Boolean);

  return parts.join(", ") || `${duration.estimatedCalendarDays} dia(s)`;
}
