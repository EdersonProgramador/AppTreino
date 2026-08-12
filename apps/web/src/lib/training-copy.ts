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
  rateWorkout: "Avaliar treino",
  todayWorkout: "Treino de hoje",
  continueWorkout: "Continuar treino",
  startSession: "Iniciar sessão",
  openWorkout: "Abrir treino",
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
