import type { FastifyInstance } from "fastify";
import { initialPlans } from "@app-treino/shared";
import { env } from "../env.js";
import { prisma } from "../prisma.js";
import { DEFAULT_SYSTEM_SETTINGS, ensureDefaultSystemSettings } from "./commerce.utils.js";

export async function registerPublicRoutes(app: FastifyInstance) {
  app.get("/plans", async () => {
    if (!env.DATABASE_URL) {
      return {
        plans: initialPlans
      };
    }

    const plans = await prisma.plan.findMany({
      where: { deletedAt: null },
      orderBy: {
        priceInCents: "asc"
      }
    });

    return {
      plans: plans.length > 0 ? plans : initialPlans
    };
  });

  app.get("/public/config", async () => {
    if (!env.DATABASE_URL) {
      return { config: { ...DEFAULT_SYSTEM_SETTINGS } };
    }

    await ensureDefaultSystemSettings();

    const publicKeys = [
      "qr_checkin_url",
      "qr_checkin_enabled",
      "module_products",
      "module_purchases",
      "module_qr",
      "module_cards",
      "module_favorites",
      "module_ratings",
      "module_contact"
    ];

    const records = await prisma.systemSetting.findMany({
      where: { key: { in: publicKeys } }
    });

    const config = { ...DEFAULT_SYSTEM_SETTINGS };
    for (const record of records) {
      config[record.key] = record.value;
    }

    return { config };
  });
}
