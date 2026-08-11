export type ProgramTargetGender = "ALL" | "MALE" | "FEMALE";
export type StudentGender = "MALE" | "FEMALE" | null | undefined;

export type ProgramPublishReadinessInput = {
  daysCount: number;
  modality?: {
    isActive: boolean;
    deletedAt: Date | null;
    name: string;
  } | null;
  days: Array<{
    dayNumber: number;
    workoutBlock?: {
      deletedAt: Date | null;
      title: string;
      exercises?: Array<{
        exercise?: {
          deletedAt: Date | null;
          title?: string | null;
          name?: string | null;
        } | null;
      }>;
    } | null;
  }>;
};

export function studentMatchesProgramTargetGender(targetGender: ProgramTargetGender, studentGender: StudentGender) {
  if (targetGender === "ALL") {
    return true;
  }

  if (!studentGender) {
    return false;
  }

  return studentGender === targetGender;
}

export function buildProgramPublishReadiness(input: ProgramPublishReadinessInput) {
  const issues: string[] = [];

  if (!input.modality || input.modality.deletedAt) {
    issues.push("Selecione uma modalidade válida.");
  } else if (!input.modality.isActive) {
    issues.push(`A modalidade "${input.modality.name}" está inativa.`);
  }

  if (input.daysCount === 0) {
    issues.push("Cadastre ao menos um dia no ciclo.");
  }

  for (const day of input.days) {
    const block = day.workoutBlock;

    if (!block || block.deletedAt) {
      issues.push(`O dia ${day.dayNumber} referencia uma ficha removida ou inexistente.`);
      continue;
    }

    const activeExercises = (block.exercises ?? []).filter((entry) => entry.exercise && !entry.exercise.deletedAt);

    if (activeExercises.length === 0) {
      issues.push(`A ficha "${block.title}" (dia ${day.dayNumber}) não possui exercícios ativos.`);
    }
  }

  return {
    ready: issues.length === 0,
    issues
  };
}

export function filterActiveBlockExercises<
  T extends {
    exercise: {
      deletedAt: Date | null;
    };
  }
>(exercises: T[]) {
  return exercises.filter((entry) => !entry.exercise.deletedAt);
}
