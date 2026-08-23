import { PrismaClient } from "@prisma/client";
import { env } from "./env.js";

export const prisma = new PrismaClient({
  datasources: {
    db: {
      url: env.DATABASE_URL
    }
  },
  omit: {
    user: {
      passwordHash: true
    }
  }
});

export type AppPrismaClient = typeof prisma;
