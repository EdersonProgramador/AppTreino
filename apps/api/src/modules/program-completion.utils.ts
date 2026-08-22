import { prisma } from "../prisma.js";
import { notifyStudent } from "./notification.utils.js";

export type ProgramCycleRecordInput = {
  userId: string;
  programId: string;
  programTitle: string;
  modalityId: string | null;
  modalityName: string;
  completedAt?: Date;
  notify?: boolean;
};

/** Registra um ciclo concluído e atualiza o selo da modalidade. Não apaga o treino do painel. */
export async function recordProgramCycleCompletion(input: ProgramCycleRecordInput) {
  const completedAt = input.completedAt ?? new Date();
  const notify = input.notify !== false;
  const modalityName = input.modalityName.trim() || "Modalidade";

  const existingCount = await prisma.programCycleCompletion.count({
    where: {
      userId: input.userId,
      programId: input.programId
    }
  });

  const cycleNumber = existingCount + 1;

  await prisma.$transaction(async (tx) => {
    await tx.programCycleCompletion.create({
      data: {
        userId: input.userId,
        programId: input.programId,
        modalityId: input.modalityId,
        modalityName,
        programTitle: input.programTitle,
        cycleNumber,
        completedAt
      }
    });

    if (input.modalityId) {
      await tx.modalityAchievement.upsert({
        where: {
          userId_modalityId: {
            userId: input.userId,
            modalityId: input.modalityId
          }
        },
        create: {
          userId: input.userId,
          modalityId: input.modalityId,
          modalityName,
          completionCount: 1,
          lastCompletedAt: completedAt
        },
        update: {
          modalityName,
          completionCount: { increment: 1 },
          lastCompletedAt: completedAt
        }
      });
    }
  });

  if (notify) {
    const countLabel = cycleNumber > 1 ? ` (${cycleNumber}ª conclusão)` : "";
    await notifyStudent(input.userId, {
      type: "ACHIEVEMENT",
      title: "Programa concluído",
      message: `Você concluiu ${input.programTitle} em ${modalityName}${countLabel}. O selo de conquista foi adicionado ao seu perfil.`,
      targetSection: "profile",
      sourceType: "PROGRAM_CYCLE",
      sourceId: input.programId
    });
  }

  return { cycleNumber };
}

/** Se o aluno já tinha o ciclo COMPLETED (versão anterior), cria o histórico sem notificar de novo. */
export async function ensureProgramCycleRecorded(input: Omit<ProgramCycleRecordInput, "notify">) {
  const existingCount = await prisma.programCycleCompletion.count({
    where: {
      userId: input.userId,
      programId: input.programId
    }
  });

  if (existingCount > 0) {
    return { cycleNumber: existingCount, created: false };
  }

  const recorded = await recordProgramCycleCompletion({ ...input, notify: false });
  return { cycleNumber: recorded.cycleNumber, created: true };
}
