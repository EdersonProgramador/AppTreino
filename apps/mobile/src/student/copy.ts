export const trainingCopy = {
  modality: "Modalidade",
  modalities: "Modalidades",
  workout: "Treino",
  workouts: "Treinos",
  session: "Sessão",
  sessions: "Sessões",
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
  achievementsHeading: "Selos de conquista",
  achievementsHint: "Cada modalidade concluída gera um selo. Repetir o ciclo aumenta a contagem.",
  achievementsEmpty: "Conclua um treino completo para ganhar o primeiro selo.",
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
  sessionFocusFallback: "Sessão de treino"
} as const;

export function sessionLabelFromBlock(title?: string | null) {
  if (!title) return "Sessão";
  const match = title.match(/\b([A-Z])\b/);
  if (match) return `Sessão ${match[1]}`;
  if (/treino/i.test(title)) return title.replace(/ficha/gi, "sessão");
  return title;
}
