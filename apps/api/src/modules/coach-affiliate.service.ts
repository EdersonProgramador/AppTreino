import {
  COACH_COMMISSION_HOLDING_DAYS,
  COACH_COMMISSION_RATE,
  COACH_MIN_WITHDRAWAL_CENTS,
  calculateCoachCommission,
  prepareCoachReferralSlugInput
} from "@app-treino/shared";
import type { Payment, Prisma } from "@prisma/client";
import { prisma } from "../prisma.js";

function slugify(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

export function normalizeReferralSlug(raw?: string | null) {
  if (!raw?.trim()) return null;
  return prepareCoachReferralSlugInput(raw);
}

async function defaultReferralSlugForCoach(coach: { id: string; name: string }, organizationSlug?: string | null) {
  if (organizationSlug) {
    const orgPart = slugify(organizationSlug);
    if (orgPart) {
      let slug = `${orgPart}-${coach.id.slice(-4)}`;
      let attempt = 0;
      while (await prisma.coachReferralLink.findUnique({ where: { slug } })) {
        attempt += 1;
        slug = `${orgPart}-${coach.id.slice(-4)}-${attempt}`;
      }
      return slug;
    }
  }

  const firstName = coach.name.trim().split(/\s+/)[0] ?? "";
  const baseSlug = slugify(firstName) || "coach";
  let slug = `${baseSlug}-${coach.id.slice(-6)}`;
  let attempt = 0;
  while (await prisma.coachReferralLink.findUnique({ where: { slug } })) {
    attempt += 1;
    slug = `${baseSlug}-${coach.id.slice(-4)}-${attempt}`;
  }
  return slug;
}

export async function updateCoachReferralSlug(coachUserId: string, rawSlug: string) {
  const slug = prepareCoachReferralSlugInput(rawSlug);
  if (!slug) {
    throw new Error("Apelido inválido. Use 3–40 caracteres (letras, números e hífen), sem palavras reservadas.");
  }

  const link = await ensureCoachReferralLink(coachUserId);
  if (!link) {
    throw new Error("Link de afiliado indisponível.");
  }

  if (link.slug === slug) {
    return link;
  }

  const taken = await prisma.coachReferralLink.findFirst({
    where: {
      slug,
      id: { not: link.id }
    }
  });
  if (taken) {
    throw new Error("Este apelido já está em uso. Escolha outro.");
  }

  return prisma.coachReferralLink.update({
    where: { id: link.id },
    data: { slug }
  });
}

async function ensureCoachWallet(tx: Prisma.TransactionClient, coachUserId: string) {
  return tx.coachWallet.upsert({
    where: { coachUserId },
    create: { coachUserId },
    update: {}
  });
}

export async function ensureCoachReferralLink(coachUserId: string) {
  const existing = await prisma.coachReferralLink.findFirst({
    where: { coachUserId, isActive: true },
    orderBy: { createdAt: "asc" }
  });
  if (existing) return existing;

  const coach = await prisma.user.findUnique({
    where: { id: coachUserId },
    select: { id: true, name: true }
  });
  if (!coach) return null;

  const membership = await prisma.organizationMember.findFirst({
    where: {
      userId: coachUserId,
      role: "COACH",
      status: "ACTIVE"
    },
    include: {
      organization: { select: { slug: true } }
    },
    orderBy: { createdAt: "asc" }
  });

  const slug = await defaultReferralSlugForCoach(coach, membership?.organization?.slug ?? null);

  return prisma.coachReferralLink.create({
    data: {
      coachUserId,
      organizationId: membership?.organizationId ?? null,
      slug
    }
  });
}

export async function recordReferralLinkClick(slug: string) {
  const normalized = normalizeReferralSlug(slug);
  if (!normalized) return null;

  const link = await prisma.coachReferralLink.findFirst({
    where: { slug: normalized, isActive: true }
  });
  if (!link) return null;

  return prisma.coachReferralLink.update({
    where: { id: link.id },
    data: { clickCount: { increment: 1 } }
  });
}

export async function applyReferralAttributionForUser(userId: string, referralSlug?: string | null) {
  const slug = normalizeReferralSlug(referralSlug);
  if (!slug) return null;

  const existing = await prisma.userReferralAttribution.findUnique({
    where: { athleteUserId: userId }
  });
  if (existing) return existing;

  const link = await prisma.coachReferralLink.findFirst({
    where: { slug, isActive: true },
    include: {
      coach: { select: { id: true, name: true, deletedAt: true, status: true } }
    }
  });
  if (!link || link.coach.deletedAt || link.coach.status !== "ACTIVE") return null;

  const coachMembership = await prisma.organizationMember.findFirst({
    where: {
      userId: link.coachUserId,
      role: "COACH",
      status: "ACTIVE",
      ...(link.organizationId ? { organizationId: link.organizationId } : {})
    },
    include: {
      organization: { select: { id: true, deletedAt: true, status: true } },
      unit: { select: { id: true, deletedAt: true, status: true } }
    },
    orderBy: { createdAt: "asc" }
  });

  const organizationId = coachMembership?.organizationId ?? link.organizationId ?? null;
  const unitId = coachMembership?.unitId ?? null;

  const attribution = await prisma.$transaction(async (tx) => {
    const created = await tx.userReferralAttribution.create({
      data: {
        athleteUserId: userId,
        coachUserId: link.coachUserId,
        referralLinkId: link.id,
        organizationId
      }
    });

    await tx.coachReferralLink.update({
      where: { id: link.id },
      data: { signupCount: { increment: 1 } }
    });

    if (organizationId && unitId && coachMembership?.organization?.deletedAt == null) {
      await tx.athleteOrganizationLink.upsert({
        where: {
          athleteId_organizationId_unitId: {
            athleteId: userId,
            organizationId,
            unitId
          }
        },
        create: {
          athleteId: userId,
          organizationId,
          unitId,
          status: "ACTIVE"
        },
        update: {
          status: "ACTIVE",
          deletedAt: null
        }
      });

      const existingAssignment = await tx.professionalAssignment.findFirst({
        where: {
          organizationId,
          professionalId: link.coachUserId,
          athleteId: userId,
          professionalType: "COACH",
          deletedAt: null
        }
      });
      if (!existingAssignment) {
        await tx.professionalAssignment.create({
          data: {
            organizationId,
            unitId,
            professionalId: link.coachUserId,
            athleteId: userId,
            professionalType: "COACH",
            status: "ACTIVE",
            isPrimary: true
          }
        });
      }
    }

    return created;
  });

  return attribution;
}

export async function releaseMaturedCoachCommissions(coachUserId: string) {
  const now = new Date();
  const matured = await prisma.coachCommissionEntry.findMany({
    where: {
      coachUserId,
      status: "PENDING",
      availableAt: { lte: now }
    }
  });
  if (!matured.length) return;

  const total = matured.reduce((sum, item) => sum + item.amountInCents, 0);

  await prisma.$transaction(async (tx) => {
    await tx.coachCommissionEntry.updateMany({
      where: { id: { in: matured.map((item) => item.id) } },
      data: { status: "AVAILABLE" }
    });

    const wallet = await ensureCoachWallet(tx, coachUserId);
    await tx.coachWallet.update({
      where: { coachUserId },
      data: {
        pendingInCents: Math.max(0, wallet.pendingInCents - total),
        availableInCents: wallet.availableInCents + total
      }
    });
  });
}

export async function accrueCoachCommissionForPayment(
  payment: Payment & { membership: { userId: string; status: string } }
) {
  if (payment.status !== "CONFIRMED") return null;

  const existing = await prisma.coachCommissionEntry.findUnique({
    where: { paymentId: payment.id }
  });
  if (existing) return existing;

  const attribution = await prisma.userReferralAttribution.findUnique({
    where: { athleteUserId: payment.membership.userId },
    include: {
      referralLink: { select: { id: true, isActive: true } }
    }
  });
  if (!attribution || attribution.status !== "ACTIVE") return null;

  const membership = await prisma.membership.findUnique({
    where: { id: payment.membershipId },
    select: { status: true }
  });
  if (!membership || membership.status !== "ACTIVE") return null;

  const amountInCents = calculateCoachCommission(payment.amountInCents);
  if (amountInCents <= 0) return null;

  const availableAt = addDays(new Date(), COACH_COMMISSION_HOLDING_DAYS);

  return prisma.$transaction(async (tx) => {
    const entry = await tx.coachCommissionEntry.create({
      data: {
        coachUserId: attribution.coachUserId,
        athleteUserId: attribution.athleteUserId,
        paymentId: payment.id,
        referralLinkId: attribution.referralLinkId,
        amountInCents,
        commissionRate: COACH_COMMISSION_RATE,
        status: "PENDING",
        availableAt
      }
    });

    const wallet = await ensureCoachWallet(tx, attribution.coachUserId);
    await tx.coachWallet.update({
      where: { coachUserId: attribution.coachUserId },
      data: {
        pendingInCents: wallet.pendingInCents + amountInCents
      }
    });

    return entry;
  });
}

export async function reverseCoachCommissionForPayment(paymentId: string) {
  const entry = await prisma.coachCommissionEntry.findUnique({
    where: { paymentId }
  });
  if (!entry || entry.status === "REVERSED" || entry.status === "PAID") return null;

  await prisma.$transaction(async (tx) => {
    await tx.coachCommissionEntry.update({
      where: { id: entry.id },
      data: { status: "REVERSED" }
    });

    const wallet = await ensureCoachWallet(tx, entry.coachUserId);
    if (entry.status === "PENDING") {
      await tx.coachWallet.update({
        where: { coachUserId: entry.coachUserId },
        data: {
          pendingInCents: Math.max(0, wallet.pendingInCents - entry.amountInCents)
        }
      });
    } else if (entry.status === "AVAILABLE") {
      await tx.coachWallet.update({
        where: { coachUserId: entry.coachUserId },
        data: {
          availableInCents: Math.max(0, wallet.availableInCents - entry.amountInCents)
        }
      });
    } else if (entry.status === "LOCKED") {
      await tx.coachWallet.update({
        where: { coachUserId: entry.coachUserId },
        data: {
          lockedInCents: Math.max(0, wallet.lockedInCents - entry.amountInCents)
        }
      });
    }
  });

  return entry;
}

export async function syncReferralAttributionMembershipStatus(userId: string, membershipStatus: string) {
  const attribution = await prisma.userReferralAttribution.findUnique({
    where: { athleteUserId: userId }
  });
  if (!attribution) return null;

  const nextStatus = membershipStatus === "ACTIVE" ? "ACTIVE" : "INACTIVE";
  if (attribution.status === nextStatus) return attribution;

  return prisma.userReferralAttribution.update({
    where: { id: attribution.id },
    data: { status: nextStatus }
  });
}

export async function getCoachAffiliateSummary(coachUserId: string) {
  await releaseMaturedCoachCommissions(coachUserId);

  const [link, wallet, commissions, withdrawals, referredAthletes] = await Promise.all([
    ensureCoachReferralLink(coachUserId),
    prisma.coachWallet.findUnique({ where: { coachUserId } }),
    prisma.coachCommissionEntry.findMany({
      where: { coachUserId },
      orderBy: { createdAt: "desc" },
      take: 50,
      include: {
        payment: {
          select: {
            id: true,
            paidAt: true,
            amountInCents: true,
            membership: {
              select: {
                user: { select: { id: true, name: true, email: true } }
              }
            }
          }
        }
      }
    }),
    prisma.coachWithdrawalRequest.findMany({
      where: { coachUserId },
      orderBy: { createdAt: "desc" },
      take: 20
    }),
    prisma.userReferralAttribution.count({
      where: { coachUserId, status: "ACTIVE" }
    })
  ]);

  return {
    commissionRate: COACH_COMMISSION_RATE,
    commissionRateLabel: "8%",
    minWithdrawalInCents: COACH_MIN_WITHDRAWAL_CENTS,
    holdingDays: COACH_COMMISSION_HOLDING_DAYS,
    referralLink: link,
    wallet: wallet ?? {
      coachUserId,
      availableInCents: 0,
      pendingInCents: 0,
      lockedInCents: 0,
      withdrawnInCents: 0,
      pixKey: null,
      pixKeyType: null
    },
    activeReferrals: referredAthletes,
    commissions: commissions.map((item) => ({
      id: item.id,
      amountInCents: item.amountInCents,
      status: item.status,
      availableAt: item.availableAt,
      createdAt: item.createdAt,
      athlete: item.payment.membership.user
    })),
    withdrawals
  };
}

export async function updateCoachWalletPix(coachUserId: string, pixKey: string, pixKeyType?: string | null) {
  const trimmed = pixKey.trim();
  if (trimmed.length < 5) {
    throw new Error("Informe uma chave PIX válida.");
  }

  return prisma.coachWallet.upsert({
    where: { coachUserId },
    create: {
      coachUserId,
      pixKey: trimmed,
      pixKeyType: pixKeyType?.trim() || null
    },
    update: {
      pixKey: trimmed,
      pixKeyType: pixKeyType?.trim() || null
    }
  });
}

export async function requestCoachWithdrawal(coachUserId: string, amountInCents: number) {
  if (amountInCents < COACH_MIN_WITHDRAWAL_CENTS) {
    throw new Error(`Saque mínimo: R$ ${(COACH_MIN_WITHDRAWAL_CENTS / 100).toFixed(2).replace(".", ",")}.`);
  }

  await releaseMaturedCoachCommissions(coachUserId);

  const wallet = await prisma.coachWallet.findUnique({ where: { coachUserId } });
  if (!wallet?.pixKey) {
    throw new Error("Cadastre sua chave PIX antes de solicitar saque.");
  }
  if (wallet.availableInCents < amountInCents) {
    throw new Error("Saldo disponível insuficiente.");
  }

  return prisma.$transaction(async (tx) => {
    const current = await tx.coachWallet.findUniqueOrThrow({ where: { coachUserId } });
    if (current.availableInCents < amountInCents) {
      throw new Error("Saldo disponível insuficiente.");
    }

    await tx.coachWallet.update({
      where: { coachUserId },
      data: {
        availableInCents: current.availableInCents - amountInCents,
        lockedInCents: current.lockedInCents + amountInCents
      }
    });

    return tx.coachWithdrawalRequest.create({
      data: {
        coachUserId,
        amountInCents,
        pixKey: current.pixKey!,
        pixKeyType: current.pixKeyType,
        status: "PENDING"
      }
    });
  });
}

export async function listPendingCoachWithdrawals() {
  return prisma.coachWithdrawalRequest.findMany({
    where: { status: { in: ["PENDING", "APPROVED"] } },
    orderBy: { createdAt: "asc" },
    include: {
      coach: { select: { id: true, name: true, email: true, phone: true } }
    }
  });
}

export async function markCoachWithdrawalPaid(withdrawalId: string, adminUserId: string, adminNote?: string | null) {
  const withdrawal = await prisma.coachWithdrawalRequest.findUnique({
    where: { id: withdrawalId }
  });
  if (!withdrawal || !["PENDING", "APPROVED"].includes(withdrawal.status)) {
    throw new Error("Solicitação de saque inválida.");
  }

  return prisma.$transaction(async (tx) => {
    const wallet = await tx.coachWallet.findUniqueOrThrow({
      where: { coachUserId: withdrawal.coachUserId }
    });

    await tx.coachWallet.update({
      where: { coachUserId: withdrawal.coachUserId },
      data: {
        lockedInCents: Math.max(0, wallet.lockedInCents - withdrawal.amountInCents),
        withdrawnInCents: wallet.withdrawnInCents + withdrawal.amountInCents
      }
    });

    return tx.coachWithdrawalRequest.update({
      where: { id: withdrawalId },
      data: {
        status: "PAID",
        approvedById: adminUserId,
        adminNote: adminNote?.trim() || null,
        paidAt: new Date()
      }
    });
  });
}

export async function rejectCoachWithdrawal(withdrawalId: string, adminUserId: string, adminNote?: string | null) {
  const withdrawal = await prisma.coachWithdrawalRequest.findUnique({
    where: { id: withdrawalId }
  });
  if (!withdrawal || withdrawal.status !== "PENDING") {
    throw new Error("Solicitação de saque inválida.");
  }

  return prisma.$transaction(async (tx) => {
    const wallet = await tx.coachWallet.findUniqueOrThrow({
      where: { coachUserId: withdrawal.coachUserId }
    });

    await tx.coachWallet.update({
      where: { coachUserId: withdrawal.coachUserId },
      data: {
        lockedInCents: Math.max(0, wallet.lockedInCents - withdrawal.amountInCents),
        availableInCents: wallet.availableInCents + withdrawal.amountInCents
      }
    });

    return tx.coachWithdrawalRequest.update({
      where: { id: withdrawalId },
      data: {
        status: "REJECTED",
        approvedById: adminUserId,
        adminNote: adminNote?.trim() || null
      }
    });
  });
}
