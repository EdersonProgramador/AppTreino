/**
 * Glossário único da plataforma (app de treino profissional).
 * Admin e aluno usam os mesmos termos públicos.
 *
 * | Conceito              | Nome na UI        |
 * |-----------------------|-------------------|
 * | Categoria             | Modalidade        |
 * | Plano publicado       | Treino            |
 * | Dia A/B/C do ciclo    | Sessão            |
 * | Bloco montado (admin) | Divisão           |
 * | Conteúdo unitário     | Exercício         |
 * | Avaliação corporal    | Avaliação física  |
 * | Nota/estrelas         | Avaliar treino    |
 * | Favoritos + notas     | Favoritos e avaliações |
 */

export const trainingCopy = {
  modality: "Modalidade",
  modalities: "Modalidades",
  workout: "Treino",
  workouts: "Treinos",
  session: "Sessão",
  sessions: "Sessões",
  division: "Divisão",
  divisions: "Divisões",
  exercise: "Exercício",
  exercises: "Exercícios",
  physicalAssessment: "Avaliação física",
  favoritesAndRatings: "Favoritos e avaliações",
  rateWorkout: "Avaliar treino",
  todayWorkout: "Treino de hoje",
  continueWorkout: "Continuar treino",
  startSession: "Iniciar sessão",
  openWorkout: "Abrir treino",
  repeatWorkout: "Repetir treino",
  completedBadge: "Concluído",
  programCompleted: "Você concluiu este treino. Repita para iniciar um novo ciclo.",
  programCompletedToast: "Programa concluído! Selo de conquista adicionado ao perfil.",
  repeatStartedToast: "Novo ciclo iniciado. Você pode treinar de novo.",
  achievementsHeading: "Selos de conquista",
  achievementsHint: "Cada modalidade concluída gera um selo. Repetir o ciclo aumenta a contagem.",
  achievementsEmpty: "Conclua um treino completo para ganhar o primeiro selo.",
  yourWorkouts: "Seus treinos",
  workoutHistory: "Histórico de treinos",
  sessionsDone: (done: number, total: number) => `${done} de ${total} sessões`,
  workoutsCount: (count: number) => (count === 1 ? "1 treino" : `${count} treinos`),
  noWorkouts: "Nenhum treino disponível no momento.",
  noWorkoutsHint: "Quando a academia publicar um treino para você, ele aparece aqui.",
  pickWorkout: "Escolha um treino para ver as sessões e começar.",
  pickModality: "Escolha a modalidade para ver os treinos disponíveis.",
  browseWorkouts: "Ver treinos",
  backToModalities: "Modalidades",
  backToWorkouts: "Treinos",
  modalityWorkoutsHeading: "Treinos disponíveis",
  filterAll: "Todos",
  sessionFocusFallback: "Sessão de treino",
  adminStudioTitle: "Estúdio de Treinos",
  adminStudioSubtitle: "Monte divisões, publique treinos e libere para os alunos",
  adminSidebar: "Estúdio de Treinos",
  adminStepLocations: "Unidades",
  adminStepModalities: "Modalidades",
  adminStepExercises: "Exercícios",
  adminStepDivisions: "Divisões",
  adminStepPublish: "Ciclos / Publicar"
} as const;

export function sessionLabelFromBlock(title: string) {
  const match = title.match(/\b([A-Z])\b/);
  if (match) return `Sessão ${match[1]}`;
  if (/treino/i.test(title)) return title.replace(/ficha/gi, "sessão");
  return title;
}
