import { prisma } from "../prisma.js";

export type StudentNotificationType =
  | "PRODUCT"
  | "ANNOUNCEMENT"
  | "EVENT"
  | "LOCATION"
  | "WORKOUT_PROGRAM"
  | "SUPPORT"
  | "WORKOUT"
  | "MUSIC_ALBUM"
  | "MUSIC_TRACK";

export type FanOutNotificationInput = {
  type: StudentNotificationType;
  title: string;
  message: string;
  targetSection?: string | null;
  sourceType?: string | null;
  sourceId?: string | null;
  /** Se informado, notifica só estes alunos; senão, todos os USER ativos. */
  userIds?: string[];
};

export async function listActiveStudentIds(userIds?: string[]) {
  const users = await prisma.user.findMany({
    where: {
      role: "USER",
      status: "ACTIVE",
      deletedAt: null,
      ...(userIds?.length ? { id: { in: userIds } } : {})
    },
    select: { id: true }
  });
  return users.map((user) => user.id);
}

/** Cria um registro de notificação para cada aluno destinatário. */
export async function fanOutStudentNotifications(input: FanOutNotificationInput) {
  const recipientIds = await listActiveStudentIds(input.userIds);
  if (recipientIds.length === 0) {
    return { count: 0 };
  }

  await prisma.studentNotification.createMany({
    data: recipientIds.map((userId) => ({
      userId,
      type: input.type,
      title: input.title,
      message: input.message,
      targetSection: input.targetSection ?? null,
      sourceType: input.sourceType ?? null,
      sourceId: input.sourceId ?? null
    }))
  });

  return { count: recipientIds.length };
}

export async function notifyStudent(userId: string, input: Omit<FanOutNotificationInput, "userIds">) {
  return fanOutStudentNotifications({ ...input, userIds: [userId] });
}
