import type { FastifyInstance } from "fastify";
import { createReadStream } from "node:fs";
import { z } from "zod";
import { getDerivedImage, mediaCacheControl } from "../media-optimize.js";

const mediaQuerySchema = z.object({
  path: z.string().min(3).max(500),
  w: z.coerce.number().int().min(48).max(2000).optional().default(720),
  q: z.coerce.number().int().min(40).max(90).optional().default(72)
});

/**
 * Thumbs sob demanda para imagens já salvas em /uploads.
 * Ex.: GET /media?path=images/foo.jpg&w=480
 */
export async function registerMediaRoutes(app: FastifyInstance) {
  app.get("/media", async (request, reply) => {
    const query = mediaQuerySchema.parse(request.query);
    const derived = await getDerivedImage({
      relativePath: query.path,
      width: query.w,
      quality: query.q
    });

    if (!derived) {
      return reply.code(404).send({ message: "Mídia não encontrada ou formato inválido." });
    }

    reply.header("Content-Type", derived.mimeType);
    reply.header("Cache-Control", mediaCacheControl(true));
    reply.header("X-Content-Type-Options", "nosniff");
    reply.header("Vary", "Accept");
    if (derived.cacheHit) {
      reply.header("X-Media-Cache", "HIT");
    } else {
      reply.header("X-Media-Cache", "MISS");
    }

    return reply.send(createReadStream(derived.absolutePath));
  });
}
