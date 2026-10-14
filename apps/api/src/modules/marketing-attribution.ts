import {
  marketingAttributionHasSignal,
  normalizeMarketingAttribution,
  type MarketingAttribution
} from "@app-treino/shared";
import { prisma } from "../prisma.js";
import { z } from "zod";

export const marketingAttributionBodySchema = z
  .unknown()
  .optional()
  .transform((value) => normalizeMarketingAttribution(value ?? null));

export async function persistFirstTouchMarketingAttribution(
  userId: string,
  attribution: MarketingAttribution | null | undefined
) {
  if (!marketingAttributionHasSignal(attribution)) return;

  const capturedAt = attribution?.capturedAt ? new Date(attribution.capturedAt) : new Date();
  const safeCapturedAt = Number.isNaN(capturedAt.getTime()) ? new Date() : capturedAt;

  try {
    await prisma.userMarketingAttribution.create({
      data: {
        userId,
        utmSource: attribution?.utmSource ?? null,
        utmMedium: attribution?.utmMedium ?? null,
        utmCampaign: attribution?.utmCampaign ?? null,
        utmContent: attribution?.utmContent ?? null,
        utmTerm: attribution?.utmTerm ?? null,
        landingPath: attribution?.landingPath ?? null,
        capturedAt: safeCapturedAt
      }
    });
  } catch (error) {
    const code = typeof error === "object" && error && "code" in error ? String(error.code) : "";
    if (code === "P2002") return;
    throw error;
  }
}
