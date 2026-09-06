import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { COACH_MIN_WITHDRAWAL_CENTS } from "@app-treino/shared";
import { requireAuth, type AuthTokenPayload } from "../auth.js";
import { env } from "../env.js";
import { loadOrgAuthContext } from "./org-auth/context.js";
import {
  getCoachAffiliateSummary,
  listPendingCoachWithdrawals,
  markCoachWithdrawalPaid,
  normalizeReferralSlug,
  recordReferralLinkClick,
  rejectCoachWithdrawal,
  requestCoachWithdrawal,
  updateCoachWalletPix
} from "./coach-affiliate.service.js";
import { prisma } from "../prisma.js";

function webAppOrigin() {
  const origins = env.WEB_ORIGIN.split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
  const production = origins.find(
    (origin) => !origin.includes("localhost") && !origin.includes("127.0.0.1")
  );
  return production ?? origins[0] ?? "https://www.atlly.com.br";
}

async function requireCoachStaff(user: AuthTokenPayload) {
  const ctx = await loadOrgAuthContext(user);
  const isCoach =
    ctx.isPlatformOperator ||
    ctx.isPlatformAdmin ||
    ctx.memberships.some((member) => member.role === "COACH" && member.status === "ACTIVE");
  if (!isCoach) {
    const error = new Error("Acesso restrito a coaches.") as Error & { statusCode: number };
    error.statusCode = 403;
    throw error;
  }
  return ctx;
}

async function requirePlatformAdmin(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { role: true, deletedAt: true, status: true }
  });
  if (!user || user.deletedAt || user.status !== "ACTIVE" || user.role !== "ADMIN") {
    const error = new Error("Acesso administrativo obrigatório.") as Error & { statusCode: number };
    error.statusCode = 403;
    throw error;
  }
}

export async function registerCoachAffiliateRoutes(app: FastifyInstance) {
  app.get("/public/coach-ref/:slug", async (request) => {
    const slug = normalizeReferralSlug((request.params as { slug: string }).slug);
    if (!slug) {
      return { ok: false, message: "Link inválido." };
    }

    const link = await recordReferralLinkClick(slug);
    if (!link) {
      return { ok: false, message: "Link não encontrado." };
    }

    return {
      ok: true,
      slug: link.slug,
      coachName: (
        await prisma.user.findUnique({
          where: { id: link.coachUserId },
          select: { name: true }
        })
      )?.name
    };
  });

  app.get("/coach/affiliate/summary", async (request, reply) => {
    try {
      const user = await requireAuth(app, request);
      await requireCoachStaff(user);
      const summary = await getCoachAffiliateSummary(user.id);
      const origin = webAppOrigin();

      return {
        ...summary,
        referralUrl: summary.referralLink
          ? `${origin}/ativar?ref=${encodeURIComponent(summary.referralLink.slug)}`
          : null
      };
    } catch (error) {
      request.log.error({ err: error }, "coach affiliate summary failed");
      const statusCode =
        error && typeof error === "object" && "statusCode" in error && typeof error.statusCode === "number"
          ? error.statusCode
          : 500;
      return reply.code(statusCode).send({
        message:
          statusCode === 500
            ? "Painel de receitas indisponível. Tente atualizar em instantes."
            : error instanceof Error
              ? error.message
              : "Falha ao carregar receitas."
      });
    }
  });

  app.put("/coach/affiliate/pix", async (request) => {
    const user = await requireAuth(app, request);
    await requireCoachStaff(user);
    const body = z
      .object({
        pixKey: z.string().trim().min(5).max(120),
        pixKeyType: z.string().trim().max(40).optional()
      })
      .parse(request.body);

    const wallet = await updateCoachWalletPix(user.id, body.pixKey, body.pixKeyType ?? null);
    return { wallet };
  });

  app.post("/coach/affiliate/withdrawals", async (request, reply) => {
    const user = await requireAuth(app, request);
    await requireCoachStaff(user);
    const body = z
      .object({
        amountInCents: z.coerce.number().int().min(COACH_MIN_WITHDRAWAL_CENTS)
      })
      .parse(request.body);

    try {
      const withdrawal = await requestCoachWithdrawal(user.id, body.amountInCents);
      return reply.code(201).send({ withdrawal });
    } catch (error) {
      return reply.code(400).send({
        message: error instanceof Error ? error.message : "Não foi possível solicitar saque."
      });
    }
  });

  app.get("/admin/coach-withdrawals", async (request, reply) => {
    const user = await requireAuth(app, request);
    await requirePlatformAdmin(user.id);
    const withdrawals = await listPendingCoachWithdrawals();
    return reply.send({ withdrawals });
  });

  app.post("/admin/coach-withdrawals/:id/pay", async (request, reply) => {
    const user = await requireAuth(app, request);
    await requirePlatformAdmin(user.id);
    const { id } = z.object({ id: z.string().min(1) }).parse(request.params);
    const body = z.object({ adminNote: z.string().trim().max(500).optional() }).parse(request.body ?? {});

    try {
      const withdrawal = await markCoachWithdrawalPaid(id, user.id, body.adminNote ?? null);
      return reply.send({ withdrawal });
    } catch (error) {
      return reply.code(400).send({
        message: error instanceof Error ? error.message : "Falha ao marcar saque como pago."
      });
    }
  });

  app.post("/admin/coach-withdrawals/:id/reject", async (request, reply) => {
    const user = await requireAuth(app, request);
    await requirePlatformAdmin(user.id);
    const { id } = z.object({ id: z.string().min(1) }).parse(request.params);
    const body = z.object({ adminNote: z.string().trim().max(500).optional() }).parse(request.body ?? {});

    try {
      const withdrawal = await rejectCoachWithdrawal(id, user.id, body.adminNote ?? null);
      return reply.send({ withdrawal });
    } catch (error) {
      return reply.code(400).send({
        message: error instanceof Error ? error.message : "Falha ao rejeitar saque."
      });
    }
  });
}
