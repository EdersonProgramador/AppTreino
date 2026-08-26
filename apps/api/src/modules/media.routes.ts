import type { FastifyInstance } from "fastify";
import { createReadStream } from "node:fs";
import { access, constants } from "node:fs/promises";
import { z } from "zod";
import { getDerivedImage, mediaCacheControl } from "../media-optimize.js";
import { buildPublicUploadUrl } from "../upload-security.js";
import { ensurePlayableMp4 } from "../video-transcode.js";

const mediaQuerySchema = z.object({
  path: z.string().min(3).max(500),
  w: z.coerce.number().int().min(48).max(2000).optional().default(720),
  q: z.coerce.number().int().min(40).max(90).optional().default(72)
});

const videoQuerySchema = z.object({
  path: z.string().min(3).max(500),
  force: z.coerce.boolean().optional().default(false)
});

async function fileReadable(filePath: string) {
  try {
    await access(filePath, constants.R_OK);
    return true;
  } catch {
    return false;
  }
}

/**
 * Thumbs sob demanda para imagens já salvas em /uploads.
 * Ex.: GET /media?path=images/foo.jpg&w=480
 *
 * Vídeos compatíveis (MP4 H.264):
 * Ex.: GET /media/video?path=lessons/foo.webm → stream MP4 (ou URL pública no R2)
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

  app.get("/media/video", async (request, reply) => {
    const query = videoQuerySchema.parse(request.query);
    try {
      const playable = await ensurePlayableMp4(query.path, { forceCompatible: query.force });
      if (!playable) {
        return reply.code(404).send({ message: "Vídeo não encontrado." });
      }

      const canStream = !playable.remoteOnly && (await fileReadable(playable.absolutePath));
      if (canStream) {
        // Stream bytes when local — native AV players often fail on 302 redirects.
        reply.header("Content-Type", playable.mimeType || "video/mp4");
        reply.header("Cache-Control", "public, max-age=86400");
        reply.header("Accept-Ranges", "bytes");
        reply.header("X-Content-Type-Options", "nosniff");
        return reply.send(createReadStream(playable.absolutePath));
      }

      const url = buildPublicUploadUrl(playable.relativePath);
      reply.header("Cache-Control", "public, max-age=86400");
      return reply.redirect(url);
    } catch (err) {
      request.log.error({ err, path: query.path }, "media/video transcode failed");
      return reply.code(500).send({ message: "Não foi possível converter o vídeo para MP4." });
    }
  });
}
