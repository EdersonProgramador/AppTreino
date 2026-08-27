import type { FastifyInstance } from "fastify";
import { createReadStream } from "node:fs";
import { access, constants } from "node:fs/promises";
import { z } from "zod";
import { getDerivedImage, mediaCacheControl } from "../media-optimize.js";
import { downloadObjectToTemp, isObjectStorageEnabled, removeTempDownload } from "../object-storage.js";
import { buildPublicUploadUrl } from "../upload-security.js";
import { ensurePlayableMp4, videoExtension } from "../video-transcode.js";

const mediaQuerySchema = z.object({
  path: z.string().min(3).max(500),
  w: z.coerce.number().int().min(48).max(2000).optional().default(720),
  q: z.coerce.number().int().min(40).max(90).optional().default(72)
});

const videoQuerySchema = z.object({
  path: z.string().min(3).max(500),
  force: z.coerce.boolean().optional().default(false)
});

const videoUrlQuerySchema = z.object({
  path: z.string().min(3).max(500),
  redirect: z.enum(["1", "true"]).optional()
});

const VIDEO_MIME: Record<string, string> = {
  mp4: "video/mp4",
  m4v: "video/mp4",
  mov: "video/quicktime",
  webm: "video/webm",
  mkv: "video/x-matroska",
  ogv: "video/ogg"
};

function videoMimeFor(relativePath: string) {
  const ext = relativePath.split(/[?#]/)[0].split(".").pop()?.toLowerCase() ?? "";
  return VIDEO_MIME[ext] ?? "video/mp4";
}

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
 * Vídeos compatíveis (MP4 H.264) — web e Expo usam a mesma URL:
 * Ex.: GET /media/video?path=lessons/foo.webm → stream MP4 (sem 302; players nativos quebram em redirect)
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

    /**
     * Sem transcodificação ainda é preciso entregar o vídeo no mesmo request:
     * o 302 daqui é justamente o que quebra expo-video/AVPlayer. Só sobra o
     * redirect quando nem o objeto dá para puxar.
     */
    const fallbackPublic = async () => {
      const relative = query.path.replace(/^\/+/, "").replace(/^uploads\//i, "");

      if (isObjectStorageEnabled()) {
        let temp: string | null = null;
        try {
          temp = await downloadObjectToTemp(relative);
          if (await fileReadable(temp)) {
            const cleanup = temp;
            reply.header("Content-Type", videoMimeFor(relative));
            reply.header("Cache-Control", "public, max-age=86400");
            reply.header("Accept-Ranges", "bytes");
            reply.header("X-Content-Type-Options", "nosniff");
            const stream = createReadStream(cleanup);
            stream.on("close", () => void removeTempDownload(cleanup));
            stream.on("error", () => void removeTempDownload(cleanup));
            return reply.send(stream);
          }
          await removeTempDownload(temp);
        } catch {
          if (temp) await removeTempDownload(temp);
        }
      }

      try {
        reply.header("Cache-Control", "public, max-age=300");
        return reply.redirect(buildPublicUploadUrl(relative));
      } catch {
        return reply.code(404).send({ message: "Vídeo não encontrado." });
      }
    };

    let tempStreamPath: string | null = null;
    try {
      const playable = await ensurePlayableMp4(query.path, { forceCompatible: query.force });
      if (!playable) {
        return fallbackPublic();
      }

      let absolutePath = playable.absolutePath;
      let canStream = !playable.remoteOnly && (await fileReadable(absolutePath));

      // Object storage only: pull to temp and stream (302 breaks expo-video / AVPlayer).
      if (!canStream && isObjectStorageEnabled()) {
        try {
          tempStreamPath = await downloadObjectToTemp(playable.relativePath);
          absolutePath = tempStreamPath;
          canStream = await fileReadable(absolutePath);
        } catch {
          canStream = false;
        }
      }

      if (canStream) {
        reply.header("Content-Type", playable.mimeType || "video/mp4");
        reply.header("Cache-Control", "public, max-age=86400");
        reply.header("Accept-Ranges", "bytes");
        reply.header("X-Content-Type-Options", "nosniff");
        const stream = createReadStream(absolutePath);
        if (tempStreamPath) {
          const cleanup = tempStreamPath;
          stream.on("close", () => {
            void removeTempDownload(cleanup);
          });
          stream.on("error", () => {
            void removeTempDownload(cleanup);
          });
        }
        return reply.send(stream);
      }

      return fallbackPublic();
    } catch (err) {
      if (tempStreamPath) await removeTempDownload(tempStreamPath);
      request.log.error({ err, path: query.path }, "media/video failed; redirecting to original");
      return fallbackPublic();
    }
  });

  /**
   * Compatibilidade para vídeos antigos.
   *
   * Faz no máximo uma conversão WebM/MOV → H.264 MP4, persiste o resultado no
   * R2 e devolve/redirecta para o CDN. O player nunca faz Range GETs no Render,
   * evitando o desafio 429 do Cloudflare.
   */
  app.get(
    "/media/video-url",
    { config: { rateLimit: false } },
    async (request, reply) => {
      const query = videoUrlQuerySchema.parse(request.query);
      const extension = videoExtension(query.path);
      const forceCompatible =
        (extension === "mp4" || extension === "m4v") &&
        !/\.compat\.mp4$/i.test(query.path.split(/[?#]/)[0]);
      const playable = await ensurePlayableMp4(query.path, { forceCompatible });

      if (!playable || videoExtension(playable.relativePath) !== "mp4") {
        return reply.code(422).send({
          message: "Não foi possível preparar este vídeo antigo em MP4."
        });
      }

      const url = buildPublicUploadUrl(playable.relativePath);
      reply.header("Cache-Control", "public, max-age=86400");
      reply.header("X-Content-Type-Options", "nosniff");

      if (query.redirect) {
        return reply.redirect(url);
      }
      return { url };
    }
  );
}
