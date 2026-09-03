import { resolvePlatformOwnerEmail } from "@app-treino/shared";
import type { FastifyBaseLogger } from "fastify";
import { env } from "./env.js";
import { prisma } from "./prisma.js";

export function getPlatformOwnerEmail(): string {
  return resolvePlatformOwnerEmail(env.PLATFORM_OWNER_EMAIL);
}

export async function isPlatformOwnerUserId(userId: string): Promise<boolean> {
  const operator = await prisma.platformOperator.findUnique({
    where: { userId },
    select: { userId: true }
  });
  return Boolean(operator);
}

export async function assertPlatformOwnerMutableByAdmin(
  userId: string,
  changes: { role?: string; status?: string; email?: string }
): Promise<void> {
  if (!(await isPlatformOwnerUserId(userId))) return;

  if (changes.role !== undefined && changes.role !== "ADMIN") {
    throw platformOwnerError("O proprietário da plataforma não pode ter o perfil alterado.");
  }

  if (changes.status !== undefined && changes.status !== "ACTIVE") {
    throw platformOwnerError("O proprietário da plataforma não pode ser desativado.");
  }

  if (changes.email !== undefined) {
    throw platformOwnerError("O e-mail do proprietário só pode ser alterado no próprio perfil.");
  }
}

export async function assertPlatformOwnerNotDeletable(userId: string): Promise<void> {
  if (await isPlatformOwnerUserId(userId)) {
    throw platformOwnerError("O proprietário da plataforma não pode ser excluído.");
  }
}

function platformOwnerError(message: string) {
  const error = new Error(message) as Error & { statusCode: number };
  error.statusCode = 403;
  return error;
}

export async function ensurePlatformOwnerAccount(log?: FastifyBaseLogger): Promise<void> {
  if (!env.DATABASE_URL) return;

  const ownerEmail = getPlatformOwnerEmail();
  const ownerByEmail = await prisma.user.findUnique({ where: { email: ownerEmail } });

  if (ownerByEmail) {
    await prisma.user.update({
      where: { id: ownerByEmail.id },
      data: {
        role: "ADMIN",
        status: "ACTIVE",
        deletedAt: null
      }
    });
    await prisma.platformOperator.upsert({
      where: { userId: ownerByEmail.id },
      create: { userId: ownerByEmail.id },
      update: {}
    });
    log?.info({ email: ownerEmail }, "platform owner account ensured");
  } else {
    log?.warn({ email: ownerEmail }, "platform owner email has no user yet");
  }

  const operators = await prisma.platformOperator.findMany({
    include: {
      user: {
        select: {
          id: true,
          email: true,
          role: true,
          status: true,
          deletedAt: true
        }
      }
    }
  });

  for (const operator of operators) {
    const needsRepair =
      operator.user.deletedAt !== null ||
      operator.user.status !== "ACTIVE" ||
      operator.user.role !== "ADMIN";

    if (!needsRepair) continue;

    await prisma.user.update({
      where: { id: operator.userId },
      data: {
        role: "ADMIN",
        status: "ACTIVE",
        deletedAt: null
      }
    });
    log?.info({ userId: operator.userId, email: operator.user.email }, "platform operator account repaired");
  }
}
