import { NextFunction, Request, Response } from "express";
import { fail } from "./http";

type Bucket = { count: number; resetAt: number };

const hits = new Map<string, Bucket>();

export function rateLimit(options: { windowMs: number; max: number; prefix: string }) {
  return (request: Request, response: Response, next: NextFunction) => {
    const ip = String(request.ip || request.socket.remoteAddress || "unknown");
    const key = `${options.prefix}:${ip}`;
    const now = Date.now();
    const current = hits.get(key);

    if (!current || current.resetAt < now) {
      hits.set(key, { count: 1, resetAt: now + options.windowMs });
      return next();
    }

    current.count += 1;
    if (current.count > options.max) {
      return fail(response, 429, "Muitas tentativas. Aguarde um pouco e tente de novo.");
    }

    return next();
  };
}

export const authRateLimit = rateLimit({ windowMs: 15 * 60 * 1000, max: 25, prefix: "auth" });
export const writeRateLimit = rateLimit({ windowMs: 60 * 1000, max: 40, prefix: "write" });
