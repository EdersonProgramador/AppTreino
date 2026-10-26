import { UserRole } from "@prisma/client";
import { prisma } from "../prisma.js";

/** Ordem de cadastro entre alunos (role USER), 1 = primeiro cadastrado. */
export async function athleteRegistrationNumber(userId: string, createdAt: Date) {
  const position = await prisma.user.count({
    where: {
      role: UserRole.USER,
      deletedAt: null,
      OR: [{ createdAt: { lt: createdAt } }, { createdAt, id: { lte: userId } }]
    }
  });
  return Math.max(1, position);
}
