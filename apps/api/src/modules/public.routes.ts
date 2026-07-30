import type { FastifyInstance } from "fastify";
import { initialPlans } from "@app-treino/shared";
import { env } from "../env.js";
import { prisma } from "../prisma.js";

export async function registerPublicRoutes(app: FastifyInstance) {
  app.get("/plans", async () => {
    if (!env.DATABASE_URL) {
      return {
        plans: initialPlans
      };
    }

    const plans = await prisma.plan.findMany({
      orderBy: {
        priceInCents: "asc"
      }
    });

    return {
      plans: plans.length > 0 ? plans : initialPlans
    };
  });
}
