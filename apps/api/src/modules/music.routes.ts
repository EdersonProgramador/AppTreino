import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { requireAuth, requirePathRole } from "../auth.js";
import { prisma } from "../prisma.js";
import { fanOutStudentNotifications } from "./notification.utils.js";

function requireDatabase() {
  if (!process.env.DATABASE_URL) {
    const error = new Error("DATABASE_URL is not configured") as Error & { statusCode?: number };
    error.statusCode = 503;
    throw error;
  }
}

function httpError(statusCode: number, message: string) {
  const error = new Error(message) as Error & { statusCode?: number };
  error.statusCode = statusCode;
  return error;
}

const albumSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(2000).optional().nullable(),
  coverUrl: z.string().max(2000).optional().nullable().or(z.literal("")),
  status: z.enum(["DRAFT", "PUBLISHED"]).default("DRAFT")
});

const trackSchema = z.object({
  title: z.string().min(1).max(200),
  artist: z.string().max(200).optional().nullable(),
  audioUrl: z.string().min(1).max(2000),
  coverUrl: z.string().max(2000).optional().nullable().or(z.literal("")),
  albumId: z.string().min(1).optional().nullable(),
  durationSec: z.coerce.number().int().min(0).optional().nullable(),
  sortOrder: z.coerce.number().int().min(0).optional(),
  status: z.enum(["DRAFT", "PUBLISHED"]).default("DRAFT")
});

const idParamSchema = z.object({ id: z.string().min(1) });

const trackInclude = {
  album: {
    select: { id: true, title: true, coverUrl: true, status: true }
  }
} as const;

function normalizeOptionalUrl(value?: string | null) {
  if (!value) return null;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
}

async function notifyAlbumPublished(album: { id: string; title: string }) {
  await fanOutStudentNotifications({
    type: "MUSIC_ALBUM",
    title: "Album novo disponivel",
    message: `O album "${album.title}" ja esta no Play.`,
    targetSection: "play",
    sourceType: "music_album",
    sourceId: album.id
  });
}

async function notifyTrackPublished(track: { id: string; title: string; albumId: string | null }) {
  // Album publish already notifies; skip per-track noise when attached to an album.
  if (track.albumId) return;
  await fanOutStudentNotifications({
    type: "MUSIC_TRACK",
    title: "Nova musica disponivel",
    message: `"${track.title}" ja esta no Play.`,
    targetSection: "play",
    sourceType: "music_track",
    sourceId: track.id
  });
}

export async function registerMusicRoutes(app: FastifyInstance) {
  app.addHook("preHandler", async (request) => {
    await requirePathRole(app, request, "/admin/cms/music", "ADMIN");
    await requirePathRole(app, request, "/student/music", "USER");
  });

  app.get("/admin/cms/music/albums", async () => {
    requireDatabase();
    const albums = await prisma.musicAlbum.findMany({
      where: { deletedAt: null },
      include: {
        tracks: {
          where: { deletedAt: null },
          orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }]
        }
      },
      orderBy: { createdAt: "desc" }
    });
    return { albums };
  });

  app.post("/admin/cms/music/albums", async (request, reply) => {
    requireDatabase();
    const body = albumSchema.parse(request.body);
    const album = await prisma.musicAlbum.create({
      data: {
        title: body.title,
        description: body.description?.trim() || null,
        coverUrl: normalizeOptionalUrl(body.coverUrl),
        status: body.status,
        publishedAt: body.status === "PUBLISHED" ? new Date() : null
      },
      include: {
        tracks: { where: { deletedAt: null }, orderBy: { sortOrder: "asc" } }
      }
    });

    if (album.status === "PUBLISHED") {
      await notifyAlbumPublished(album);
    }

    return reply.code(201).send({ album });
  });

  app.put("/admin/cms/music/albums/:id", async (request) => {
    requireDatabase();
    const { id } = idParamSchema.parse(request.params);
    const body = albumSchema.partial().parse(request.body);
    const current = await prisma.musicAlbum.findFirst({ where: { id, deletedAt: null } });
    if (!current) throw httpError(404, "Album nao encontrado.");

    const nextStatus = body.status ?? current.status;
    const album = await prisma.musicAlbum.update({
      where: { id },
      data: {
        title: body.title,
        description: body.description === undefined ? undefined : body.description?.trim() || null,
        coverUrl: body.coverUrl === undefined ? undefined : normalizeOptionalUrl(body.coverUrl),
        status: nextStatus,
        publishedAt:
          nextStatus === "PUBLISHED" && current.status !== "PUBLISHED" ? new Date() : undefined
      },
      include: {
        tracks: { where: { deletedAt: null }, orderBy: { sortOrder: "asc" } }
      }
    });

    if (nextStatus === "PUBLISHED" && current.status !== "PUBLISHED") {
      await notifyAlbumPublished(album);
      // Publish draft tracks belonging to this album so the catalog is consistent.
      const draftTracks = album.tracks.filter((track) => track.status !== "PUBLISHED");
      if (draftTracks.length) {
        await prisma.musicTrack.updateMany({
          where: { id: { in: draftTracks.map((track) => track.id) } },
          data: { status: "PUBLISHED", publishedAt: new Date() }
        });
      }
    }

    return { album };
  });

  app.delete("/admin/cms/music/albums/:id", async (request) => {
    requireDatabase();
    const { id } = idParamSchema.parse(request.params);
    await prisma.musicAlbum.update({
      where: { id },
      data: { deletedAt: new Date() }
    });
    await prisma.musicTrack.updateMany({
      where: { albumId: id, deletedAt: null },
      data: { deletedAt: new Date() }
    });
    return { ok: true };
  });

  app.get("/admin/cms/music/tracks", async () => {
    requireDatabase();
    const tracks = await prisma.musicTrack.findMany({
      where: { deletedAt: null },
      include: trackInclude,
      orderBy: [{ sortOrder: "asc" }, { createdAt: "desc" }]
    });
    return { tracks };
  });

  app.post("/admin/cms/music/tracks", async (request, reply) => {
    requireDatabase();
    const body = trackSchema.parse(request.body);
    if (body.albumId) {
      const album = await prisma.musicAlbum.findFirst({ where: { id: body.albumId, deletedAt: null } });
      if (!album) throw httpError(400, "Album invalido.");
    }

    const track = await prisma.musicTrack.create({
      data: {
        title: body.title,
        artist: body.artist?.trim() || null,
        audioUrl: body.audioUrl,
        coverUrl: normalizeOptionalUrl(body.coverUrl),
        albumId: body.albumId || null,
        durationSec: body.durationSec ?? null,
        sortOrder: body.sortOrder ?? 0,
        status: body.status,
        publishedAt: body.status === "PUBLISHED" ? new Date() : null
      },
      include: trackInclude
    });

    if (track.status === "PUBLISHED") {
      await notifyTrackPublished(track);
    }

    return reply.code(201).send({ track });
  });

  app.put("/admin/cms/music/tracks/:id", async (request) => {
    requireDatabase();
    const { id } = idParamSchema.parse(request.params);
    const body = trackSchema.partial().parse(request.body);
    const current = await prisma.musicTrack.findFirst({ where: { id, deletedAt: null } });
    if (!current) throw httpError(404, "Faixa nao encontrada.");

    if (body.albumId) {
      const album = await prisma.musicAlbum.findFirst({ where: { id: body.albumId, deletedAt: null } });
      if (!album) throw httpError(400, "Album invalido.");
    }

    const nextStatus = body.status ?? current.status;
    const track = await prisma.musicTrack.update({
      where: { id },
      data: {
        title: body.title,
        artist: body.artist === undefined ? undefined : body.artist?.trim() || null,
        audioUrl: body.audioUrl,
        coverUrl: body.coverUrl === undefined ? undefined : normalizeOptionalUrl(body.coverUrl),
        albumId: body.albumId === undefined ? undefined : body.albumId || null,
        durationSec: body.durationSec === undefined ? undefined : body.durationSec,
        sortOrder: body.sortOrder,
        status: nextStatus,
        publishedAt:
          nextStatus === "PUBLISHED" && current.status !== "PUBLISHED" ? new Date() : undefined
      },
      include: trackInclude
    });

    if (nextStatus === "PUBLISHED" && current.status !== "PUBLISHED") {
      await notifyTrackPublished(track);
    }

    return { track };
  });

  app.delete("/admin/cms/music/tracks/:id", async (request) => {
    requireDatabase();
    const { id } = idParamSchema.parse(request.params);
    await prisma.musicTrack.update({
      where: { id },
      data: { deletedAt: new Date() }
    });
    return { ok: true };
  });

  app.get("/student/music/catalog", async (request) => {
    requireDatabase();
    await requireAuth(app, request);

    const [albums, singles] = await Promise.all([
      prisma.musicAlbum.findMany({
        where: { deletedAt: null, status: "PUBLISHED" },
        include: {
          tracks: {
            where: { deletedAt: null, status: "PUBLISHED" },
            orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }]
          }
        },
        orderBy: [{ publishedAt: "desc" }, { createdAt: "desc" }]
      }),
      prisma.musicTrack.findMany({
        where: { deletedAt: null, status: "PUBLISHED", albumId: null },
        orderBy: [{ publishedAt: "desc" }, { createdAt: "desc" }]
      })
    ]);

    return {
      albums: albums.filter((album) => album.tracks.length > 0),
      singles
    };
  });

  app.get("/student/music/tracks/:id", async (request) => {
    requireDatabase();
    await requireAuth(app, request);
    const { id } = idParamSchema.parse(request.params);
    const track = await prisma.musicTrack.findFirst({
      where: { id, deletedAt: null, status: "PUBLISHED" },
      include: trackInclude
    });
    if (!track) throw httpError(404, "Faixa nao encontrada.");
    return { track };
  });
}
