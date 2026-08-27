import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import { requireAuth } from "../auth.js";
import { env } from "../env.js";
import { isImageUploadExtension, optimizeUploadedImage } from "../media-optimize.js";
import { prisma } from "../prisma.js";
import type { Prisma } from "@prisma/client";
import { isVideoUpload, saveValidatedUpload, uploadsDir } from "../upload-security.js";
import { persistUploadedFile } from "../upload-persist.js";
import { ensureUploadedVideoIsMp4 } from "../video-transcode.js";
import { latLngToCell, cellToLatLng, cellDisk } from "./activity-h3.js";
import {
  evaluateAntiCheat,
  mergeAntiCheat,
  shouldBlockPublish,
  shouldQuarantine,
  antiCheatUserMessage,
  type AntiCheatReport
} from "./activity-anti-cheat.js";
import {
  activityTitle,
  buildStravaSummary,
  sanitizePoints,
  sportLabel,
  type GpsPoint,
  type OutdoorSportKind
} from "./activity-geo.js";
import { matchSegments, polylineDistance, segmentCellFromPolyline } from "./activity-segments.js";

const sportSchema = z.enum(["RUN", "WALK", "RIDE"]);
const mapTypeSchema = z.enum(["standard", "satellite", "hybrid", "winter"]);
const activityMapSchema = z.enum(["global", "weekly", "night", "personal"]);
const layersSchema = z
  .object({
    pois: z.boolean().optional(),
    bikeLanes: z.boolean().optional(),
    avalanche: z.boolean().optional(),
    slope: z.boolean().optional(),
    aspect: z.boolean().optional()
  })
  .optional();

const goalsSchema = z
  .object({
    distanceKm: z.number().positive().max(200).optional(),
    durationSeconds: z.number().int().min(0).max(86400).optional(),
    speedKmh: z.number().positive().max(80).optional(),
    lapRadiusMeters: z.number().min(8).max(80).optional(),
    lapCounterOn: z.boolean().optional(),
    lapMarker: z
      .object({
        lat: z.number(),
        lng: z.number(),
        radiusMeters: z.number().min(8).max(80).optional()
      })
      .nullable()
      .optional(),
    laps: z
      .array(
        z.object({
          index: z.number(),
          lat: z.number(),
          lng: z.number(),
          t: z.number(),
          distanceMeters: z.number()
        })
      )
      .optional()
  })
  .optional();

const finiteOrNull = z.preprocess((value) => {
  if (value == null) return null;
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}, z.number().finite().nullable().optional());

const pointSchema = z
  .object({
    lat: z.number().finite(),
    lng: z.number().finite(),
    t: z.number().finite(),
    ele: finiteOrNull,
    accuracy: finiteOrNull,
    h3r9: z.string().optional(),
    h3r11: z.string().optional()
  })
  .passthrough();

const finishBodySchema = z.object({
  caption: z.string().max(2000).nullish(),
  photoUrl: z.string().nullish(),
  videoUrl: z.string().nullish(),
  mapType: mapTypeSchema.optional(),
  activityMap: activityMapSchema.optional(),
  layers: layersSchema,
  is3d: z.boolean().optional(),
  points: z.array(pointSchema).optional(),
  goals: goalsSchema,
  publish: z.boolean().optional().default(true),
  trackingMeta: z
    .object({
      rawCount: z.number().optional(),
      compressedCount: z.number().optional(),
      maskedCount: z.number().optional(),
      h3r9: z.array(z.string()).optional(),
      h3r11: z.array(z.string()).optional(),
      antiCheat: z
        .object({
          ok: z.boolean().optional(),
          flags: z.array(z.string()).optional(),
          maxImpliedSpeedMps: z.number().optional(),
          teleportCount: z.number().optional(),
          spikeCount: z.number().optional(),
          score: z.number().optional()
        })
        .passthrough()
        .optional(),
      privacy: z
        .object({
          homeRadiusM: z.number().optional(),
          masked: z.boolean().optional()
        })
        .passthrough()
        .optional(),
      distanceM: z.number().optional(),
      movingTimeMs: z.number().optional(),
      stepsCount: z.number().min(0).optional(),
      avgCadenceSpm: z.number().min(0).nullable().optional(),
      avgHeartRateBpm: z.number().min(30).max(250).nullable().optional(),
      maxHeartRateBpm: z.number().min(30).max(250).nullable().optional()
    })
    .passthrough()
    .optional()
});

type FinishBody = z.infer<typeof finishBodySchema>;

function antiCheatFromStored(activity: { antiCheatFlags: unknown; antiCheatScore: number }): AntiCheatReport {
  const stored =
    activity.antiCheatFlags && typeof activity.antiCheatFlags === "object" && !Array.isArray(activity.antiCheatFlags)
      ? (activity.antiCheatFlags as { flags?: unknown; score?: unknown; ok?: unknown })
      : {};
  const flags = Array.isArray(stored.flags) ? stored.flags.filter((flag): flag is string => typeof flag === "string") : [];
  const score = typeof stored.score === "number" ? stored.score : activity.antiCheatScore ?? 0;
  return {
    ok: typeof stored.ok === "boolean" ? stored.ok : flags.length === 0 && score < 30,
    flags,
    maxImpliedSpeedMps: 0,
    teleportCount: 0,
    spikeCount: 0,
    score,
    source: "merged"
  };
}

async function respondCompletedFinish(
  user: { id: string },
  activity: Parameters<typeof serializeActivity>[0] & {
    antiCheatFlags: unknown;
    antiCheatScore: number;
    flagged?: boolean;
  },
  body: FinishBody
) {
  const antiCheat = antiCheatFromStored(activity);
  const publishBlocked = shouldBlockPublish(antiCheat) || Boolean(activity.flagged);
  const wantPublish = body.publish !== false && !publishBlocked;

  let post = await prisma.socialPost.findUnique({
    where: { activityId: activity.id },
    include: postInclude
  });

  let latest = activity;
  if (wantPublish && !post) {
    const caption =
      body.caption?.trim() ||
      activity.caption ||
      `${activityTitle(activity.sport as OutdoorSportKind, activity.startedAt)} · ${((activity.distanceMeters ?? 0) / 1000).toFixed(2)} km · ${sportLabel(activity.sport as OutdoorSportKind)}`;
    const photoUrl = body.photoUrl ?? activity.photoUrl;
    const videoUrl = body.videoUrl ?? activity.videoUrl;
    const mediaUrl = photoUrl || videoUrl || null;
    latest = await prisma.outdoorActivity.update({
      where: { id: activity.id },
      data: {
        photoUrl,
        videoUrl,
        caption
      }
    });
    try {
      post = await prisma.socialPost.create({
        data: {
          authorId: user.id,
          kind: "ACTIVITY",
          body: caption,
          mediaUrl,
          mediaType: videoUrl ? "VIDEO" : photoUrl ? "IMAGE" : null,
          activityId: activity.id
        },
        include: postInclude
      });
    } catch {
      post = await prisma.socialPost.findUnique({
        where: { activityId: activity.id },
        include: postInclude
      });
    }
  }

  const segmentEfforts = await prisma.outdoorSegmentEffort.findMany({
    where: { activityId: activity.id },
    include: { segment: { select: { name: true } } }
  });

  return {
    activity: serializeActivity(latest),
    segmentEfforts: segmentEfforts.map((effort) => ({
      segmentId: effort.segmentId,
      name: effort.segment.name,
      elapsedSeconds: effort.elapsedSeconds,
      paceSecPerKm: effort.paceSecPerKm,
      isPr: effort.isPr
    })),
    post: post ? await serializePost({ ...post, activity: post.activity ?? latest }, user.id) : null,
    moderation: {
      published: Boolean(post),
      blockedByAntiCheat: publishBlocked,
      antiCheat,
      quarantine: shouldQuarantine(antiCheat),
      message: antiCheatUserMessage(antiCheat)
    }
  };
}

function extractGoals(layers: unknown) {
  if (!layers || typeof layers !== "object" || Array.isArray(layers)) return null;
  const goals = (layers as { goals?: unknown }).goals;
  if (!goals || typeof goals !== "object") return null;
  return goals;
}

function withGoals(layers: unknown, goals: unknown): Prisma.InputJsonValue {
  const base =
    layers && typeof layers === "object" && !Array.isArray(layers) ? { ...(layers as Record<string, unknown>) } : {};
  if (goals) base.goals = goals;
  return base as Prisma.InputJsonValue;
}

function requireDatabase() {
  if (!env.DATABASE_URL) {
    const error = new Error("Banco de dados não configurado para esta operação.") as Error & {
      statusCode: number;
    };
    error.statusCode = 503;
    throw error;
  }
}

function httpError(statusCode: number, message: string) {
  const error = new Error(message) as Error & { statusCode: number };
  error.statusCode = statusCode;
  return error;
}

function authorCard(user: {
  id: string;
  name: string;
  profile?: { avatarUrl?: string | null } | null;
}) {
  return {
    id: user.id,
    name: user.name,
    avatarUrl: user.profile?.avatarUrl ?? null
  };
}

function downsamplePoints(points: GpsPoint[], maxPoints = 120): GpsPoint[] {
  if (points.length <= maxPoints) return points;
  const step = (points.length - 1) / (maxPoints - 1);
  const out: GpsPoint[] = [];
  for (let i = 0; i < maxPoints; i += 1) {
    out.push(points[Math.round(i * step)]!);
  }
  return out;
}

function serializeActivity(
  row: {
  id: string;
  sport: OutdoorSportKind | string;
  status: string;
  startedAt: Date;
  pausedAt: Date | null;
  finishedAt: Date | null;
  pauseMs: number;
  elapsedSeconds: number;
  movingSeconds: number;
  distanceMeters: number;
  avgPaceSecPerKm: number | null;
  avgSpeedMps: number | null;
  maxSpeedMps: number | null;
  elevationGainMeters: number;
  elevationLossMeters?: number;
  estimatedPowerWatts?: number | null;
  stepsCount?: number;
  avgCadenceSpm?: number | null;
  avgHeartRateBpm?: number | null;
  maxHeartRateBpm?: number | null;
  calories: number;
  mapType: string;
  activityMap: string;
  layers: unknown;
  is3d: boolean;
  targetDistanceMeters: number | null;
  polyline: unknown;
  summary: unknown;
  photoUrl: string | null;
  videoUrl: string | null;
  caption: string | null;
},
  options?: { maxPolylinePoints?: number }
) {
  const points = downsamplePoints(sanitizePoints(row.polyline), options?.maxPolylinePoints ?? 500);
  const summary =
    row.summary && typeof row.summary === "object" ? (row.summary as Record<string, unknown>) : null;
  const splits = Array.isArray(summary?.splits)
    ? summary.splits
    : Array.isArray(summary?.splits_metric)
      ? summary.splits_metric
      : [];
  const splitsAnalysis =
    summary?.splitsAnalysis && typeof summary.splitsAnalysis === "object"
      ? summary.splitsAnalysis
      : null;
  return {
    id: row.id,
    sport: row.sport,
    sportLabel: sportLabel(row.sport as OutdoorSportKind),
    title: activityTitle(row.sport as OutdoorSportKind, row.startedAt),
    status: row.status,
    startedAt: row.startedAt.toISOString(),
    pausedAt: row.pausedAt?.toISOString() ?? null,
    finishedAt: row.finishedAt?.toISOString() ?? null,
    pauseMs: row.pauseMs,
    elapsedSeconds: row.elapsedSeconds,
    movingSeconds: row.movingSeconds,
    distanceMeters: row.distanceMeters,
    avgPaceSecPerKm: row.avgPaceSecPerKm,
    avgSpeedMps: row.avgSpeedMps,
    maxSpeedMps: row.maxSpeedMps,
    elevationGainMeters: row.elevationGainMeters,
    elevationLossMeters:
      typeof row.elevationLossMeters === "number"
        ? row.elevationLossMeters
        : typeof summary?.elevationLossMeters === "number"
          ? summary.elevationLossMeters
          : 0,
    durationSeconds: row.elapsedSeconds,
    estimatedPowerWatts:
      typeof row.estimatedPowerWatts === "number"
        ? row.estimatedPowerWatts
        : typeof summary?.estimatedPowerWatts === "number"
          ? summary.estimatedPowerWatts
          : null,
    stepsCount: typeof row.stepsCount === "number" ? row.stepsCount : 0,
    avgCadenceSpm:
      typeof row.avgCadenceSpm === "number"
        ? row.avgCadenceSpm
        : typeof summary?.avgCadenceSpm === "number"
          ? summary.avgCadenceSpm
          : null,
    avgHeartRateBpm:
      typeof row.avgHeartRateBpm === "number"
        ? row.avgHeartRateBpm
        : typeof summary?.avgHeartRateBpm === "number"
          ? summary.avgHeartRateBpm
          : null,
    maxHeartRateBpm:
      typeof row.maxHeartRateBpm === "number"
        ? row.maxHeartRateBpm
        : typeof summary?.maxHeartRateBpm === "number"
          ? summary.maxHeartRateBpm
          : null,
    bestEfforts: Array.isArray(summary?.bestEfforts)
      ? summary.bestEfforts
      : Array.isArray(summary?.best_efforts)
        ? summary.best_efforts
        : [],
    calories: row.calories,
    mapType: row.mapType,
    activityMap: row.activityMap,
    layers: row.layers,
    is3d: row.is3d,
    targetDistanceMeters: row.targetDistanceMeters,
    goals: extractGoals(row.layers),
    pointCount: points.length,
    polyline: points,
    summary: row.summary,
    splits,
    splitsAnalysis,
    photoUrl: row.photoUrl,
    videoUrl: row.videoUrl,
    caption: row.caption
  };
}

function parseMediaItems(raw: unknown): Array<{ url: string; type: "IMAGE" | "VIDEO"; coverUrl: string | null }> {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const row = item as { url?: unknown; type?: unknown; coverUrl?: unknown };
      if (typeof row.url !== "string" || !row.url) return null;
      const type = row.type === "VIDEO" ? ("VIDEO" as const) : ("IMAGE" as const);
      const coverUrl = typeof row.coverUrl === "string" && row.coverUrl.trim() ? row.coverUrl.trim() : null;
      return { url: row.url, type, coverUrl };
    })
    .filter((item): item is { url: string; type: "IMAGE" | "VIDEO"; coverUrl: string | null } => item !== null)
    .slice(0, 10);
}

function mediaItemsFromPost(post: {
  mediaUrl: string | null;
  mediaType: string | null;
  mediaItems?: unknown;
}) {
  const fromJson = parseMediaItems(post.mediaItems);
  if (fromJson.length) return fromJson;
  if (post.mediaUrl) {
    return [
      {
        url: post.mediaUrl,
        type: (post.mediaType === "VIDEO" ? "VIDEO" : "IMAGE") as "IMAGE" | "VIDEO",
        coverUrl: null
      }
    ];
  }
  return [];
}

type SerializedComment = {
  id: string;
  body: string;
  parentId: string | null;
  createdAt: string;
  author: ReturnType<typeof authorCard>;
  likesCount: number;
  likedByMe: boolean;
  repliesCount: number;
  replies: SerializedComment[];
};

function serializeComment(
  comment: {
    id: string;
    body: string;
    parentId?: string | null;
    createdAt: Date;
    user: { id: string; name: string; profile?: { avatarUrl?: string | null } | null };
    likes?: Array<{ userId: string }>;
    _count?: { likes?: number; replies?: number };
    replies?: Array<{
      id: string;
      body: string;
      parentId?: string | null;
      createdAt: Date;
      user: { id: string; name: string; profile?: { avatarUrl?: string | null } | null };
      likes?: Array<{ userId: string }>;
      _count?: { likes?: number };
    }>;
  },
  viewerId: string
): SerializedComment {
  return {
    id: comment.id,
    body: comment.body,
    parentId: comment.parentId ?? null,
    createdAt: comment.createdAt.toISOString(),
    author: authorCard(comment.user),
    likesCount: comment._count?.likes ?? comment.likes?.length ?? 0,
    likedByMe: Boolean(comment.likes?.some((like) => like.userId === viewerId)),
    repliesCount: comment._count?.replies ?? comment.replies?.length ?? 0,
    replies: (comment.replies ?? []).map((reply) => serializeComment(reply, viewerId))
  };
}

async function serializePost(
  post: {
    id: string;
    kind: string;
    body: string | null;
    mediaUrl: string | null;
    mediaType: string | null;
    mediaItems?: unknown;
    activityId: string | null;
    createdAt: Date;
    author: { id: string; name: string; profile?: { avatarUrl?: string | null } | null };
    likes: Array<{ userId: string }>;
    dislikes?: Array<{ userId: string }>;
    comments: Array<{
      id: string;
      body: string;
      parentId?: string | null;
      createdAt: Date;
      user: { id: string; name: string; profile?: { avatarUrl?: string | null } | null };
      likes?: Array<{ userId: string }>;
      _count?: { likes?: number; replies?: number };
    }>;
    activity: Parameters<typeof serializeActivity>[0] | null;
    _count?: { likes?: number; dislikes?: number; comments?: number };
  },
  viewerId: string,
  options?: { maxPolylinePoints?: number }
) {
  const mediaItems = mediaItemsFromPost(post);
  const dislikes = post.dislikes ?? [];
  return {
    id: post.id,
    kind: post.kind,
    body: post.body,
    mediaUrl: mediaItems[0]?.url ?? post.mediaUrl,
    mediaType: mediaItems[0]?.type ?? post.mediaType,
    mediaItems,
    createdAt: post.createdAt.toISOString(),
    author: authorCard(post.author),
    likesCount: post._count?.likes ?? post.likes.length,
    likedByMe: post.likes.some((like) => like.userId === viewerId),
    dislikesCount: post._count?.dislikes ?? dislikes.length,
    dislikedByMe: dislikes.some((dislike) => dislike.userId === viewerId),
    commentsCount: post._count?.comments ?? post.comments.length,
    comments: post.comments.map((comment) => serializeComment(comment, viewerId)),
    activity: post.activity ? serializeActivity(post.activity, options) : null,
    isMine: post.author.id === viewerId
  };
}

const postInclude = {
  author: { select: { id: true, name: true, profile: { select: { avatarUrl: true } } } },
  likes: { select: { userId: true } },
  dislikes: { select: { userId: true } },
  comments: {
    where: { parentId: null },
    orderBy: { createdAt: "asc" as const },
    include: {
      user: { select: { id: true, name: true, profile: { select: { avatarUrl: true } } } },
      likes: { select: { userId: true } },
      _count: { select: { likes: true, replies: true } }
    }
  },
  activity: true
};

function feedPostInclude(viewerId: string) {
  return {
    author: { select: { id: true, name: true, profile: { select: { avatarUrl: true } } } },
    likes: { where: { userId: viewerId }, select: { userId: true }, take: 1 },
    dislikes: { where: { userId: viewerId }, select: { userId: true }, take: 1 },
    comments: {
      where: { parentId: null },
      orderBy: { createdAt: "desc" as const },
      take: 2,
      include: {
        user: { select: { id: true, name: true, profile: { select: { avatarUrl: true } } } },
        likes: { where: { userId: viewerId }, select: { userId: true }, take: 1 },
        _count: { select: { likes: true, replies: true } }
      }
    },
    _count: { select: { likes: true, dislikes: true, comments: true } },
    activity: {
      select: {
        id: true,
        sport: true,
        status: true,
        startedAt: true,
        pausedAt: true,
        finishedAt: true,
        pauseMs: true,
        elapsedSeconds: true,
        movingSeconds: true,
        distanceMeters: true,
        avgPaceSecPerKm: true,
        avgSpeedMps: true,
        maxSpeedMps: true,
        elevationGainMeters: true,
        elevationLossMeters: true,
        estimatedPowerWatts: true,
        stepsCount: true,
        avgCadenceSpm: true,
        avgHeartRateBpm: true,
        maxHeartRateBpm: true,
        calories: true,
        mapType: true,
        activityMap: true,
        layers: true,
        is3d: true,
        targetDistanceMeters: true,
        polyline: true,
        summary: true,
        photoUrl: true,
        videoUrl: true,
        caption: true
      }
    }
  };
}

async function notify(userId: string, actorName: string, type: string, title: string, message: string, sourceId: string) {
  await prisma.studentNotification.create({
    data: {
      userId,
      type,
      title,
      message: `${actorName} ${message}`,
      targetSection: "feed",
      sourceType: "SOCIAL",
      sourceId
    }
  });
}

async function ensureDefaultChallenges() {
  const count = await prisma.clubChallenge.count();
  if (count > 0) return;
  await prisma.clubChallenge.createMany({
    data: [
      {
        slug: "5k-semana",
        title: "Desafio 5K da semana",
        description: "Complete 5 km de corrida nesta semana e publique no Feed.",
        sport: "RUN",
        goalMeters: 5000,
        period: "WEEK"
      },
      {
        slug: "caminhada-20km",
        title: "Caminhada 20 km no mês",
        description: "Some 20 km de caminhada no mês e acompanhe o ritmo no mapa.",
        sport: "WALK",
        goalMeters: 20000,
        period: "MONTH"
      },
      {
        slug: "pedal-50km",
        title: "Pedal 50 km",
        description: "Pedale 50 km no mês. O percurso 3D entra no Feed ao finalizar.",
        sport: "RIDE",
        goalMeters: 50000,
        period: "MONTH"
      }
    ]
  });
}

function periodStart(period: "WEEK" | "MONTH" | "OPEN") {
  const now = new Date();
  if (period === "OPEN") return new Date(0);
  if (period === "MONTH") return new Date(now.getFullYear(), now.getMonth(), 1);
  const start = new Date(now);
  const day = (start.getDay() + 6) % 7;
  start.setDate(start.getDate() - day);
  start.setHours(0, 0, 0, 0);
  return start;
}

export async function registerSocialRoutes(app: FastifyInstance) {
  app.get("/student/social/posts", async (request) => {
    requireDatabase();
    const user = await requireAuth(app, request);
    const query = z
      .object({
        cursor: z.string().optional(),
        q: z.string().max(80).optional(),
        authorId: z.string().optional(),
        mode: z.enum(["for-you", "following"]).optional().default("for-you"),
        page: z.coerce.number().int().min(0).max(200).optional().default(0)
      })
      .parse(request.query);

    const following = await prisma.socialFollow.findMany({
      where: { followerId: user.id },
      select: { followingId: true }
    });
    const followingIds = following.map((row) => row.followingId);
    const authorIds = [user.id, ...followingIds];
    const search = query.q?.trim();
    const pageSize = 12;

    const where = {
      hidden: false,
      ...(query.authorId ? { authorId: query.authorId } : {}),
      ...(query.mode === "following" && !search && !query.authorId
        ? { authorId: { in: authorIds } }
        : {}),
      ...(search
        ? {
            OR: [
              { body: { contains: search, mode: "insensitive" as const } },
              { author: { name: { contains: search, mode: "insensitive" as const } } }
            ]
          }
        : {}),
      ...(query.cursor ? { createdAt: { lt: new Date(query.cursor) } } : {})
    };

    const posts = await prisma.socialPost.findMany({
      where,
      include: feedPostInclude(user.id),
      orderBy: { createdAt: "desc" },
      skip: query.cursor ? 0 : query.page * pageSize,
      take: pageSize + 1
    });

    let ranked = posts;
    if (!search && !query.authorId && query.mode === "for-you") {
      ranked = [
        ...posts.filter((post) => authorIds.includes(post.authorId)),
        ...posts.filter((post) => !authorIds.includes(post.authorId))
      ];
    }

    const hasMore = ranked.length > pageSize;
    const pageRows = ranked.slice(0, pageSize);
    return {
      mode: query.mode,
      followingCount: followingIds.length,
      hasMore,
      nextCursor: hasMore ? pageRows[pageRows.length - 1]?.createdAt.toISOString() ?? null : null,
      posts: await Promise.all(
        pageRows.map((post) =>
          serializePost(
            {
              ...post,
              comments: [...post.comments].reverse()
            },
            user.id,
            { maxPolylinePoints: 120 }
          )
        )
      )
    };
  });

  app.post("/student/social/posts", async (request) => {
    requireDatabase();
    const user = await requireAuth(app, request);
    const body = z
      .object({
        body: z.string().max(2000).optional(),
        mediaUrl: z.string().url().or(z.string().startsWith("/")).optional(),
        mediaType: z.enum(["IMAGE", "VIDEO"]).optional(),
        mediaItems: z
          .array(
            z.object({
              url: z.string().url().or(z.string().startsWith("/")),
              type: z.enum(["IMAGE", "VIDEO"]),
              coverUrl: z.string().url().or(z.string().startsWith("/")).optional().nullable()
            })
          )
          .max(10)
          .optional()
      })
      .parse(request.body);

    const text = body.body?.trim() ?? "";
    const mediaItems = parseMediaItems(
      body.mediaItems?.length ? body.mediaItems : body.mediaUrl ? [{ url: body.mediaUrl, type: body.mediaType ?? "IMAGE" }] : []
    ).map((item) =>
      item.type === "IMAGE"
        ? { url: item.url, type: item.type, coverUrl: item.coverUrl || item.url }
        : { url: item.url, type: item.type, coverUrl: item.coverUrl || null }
    );
    if (!text && !mediaItems.length) {
      throw httpError(400, "Escreva algo ou anexe uma foto/vídeo.");
    }

    const first = mediaItems[0];
    const kind = first?.type === "VIDEO" ? "VIDEO" : first ? "PHOTO" : "TEXT";
    const post = await prisma.socialPost.create({
      data: {
        authorId: user.id,
        kind,
        body: text || null,
        mediaUrl: first?.url ?? null,
        mediaType: first?.type ?? null,
        mediaItems: mediaItems.length ? mediaItems : undefined
      },
      include: postInclude
    });
    return { post: await serializePost(post, user.id) };
  });

  app.delete("/student/social/posts/:id", async (request) => {
    requireDatabase();
    const user = await requireAuth(app, request);
    const { id } = z.object({ id: z.string().min(1) }).parse(request.params);
    const post = await prisma.socialPost.findUnique({ where: { id } });
    if (!post || post.hidden) throw httpError(404, "Publicação não encontrada.");
    if (post.authorId !== user.id) throw httpError(403, "Só o autor pode apagar esta publicação.");
    await prisma.socialPost.update({ where: { id }, data: { hidden: true } });
    return { ok: true };
  });

  app.post("/student/social/posts/:id/report", async (request) => {
    requireDatabase();
    const user = await requireAuth(app, request);
    const { id } = z.object({ id: z.string().min(1) }).parse(request.params);
    const { reason } = z.object({ reason: z.string().min(3).max(500) }).parse(request.body);
    const post = await prisma.socialPost.findUnique({ where: { id } });
    if (!post || post.hidden) throw httpError(404, "Publicação não encontrada.");
    await prisma.socialReport.create({
      data: { userId: user.id, postId: id, reason: reason.trim() }
    });
    return { ok: true };
  });

  app.post("/student/social/posts/:id/like", async (request) => {
    requireDatabase();
    const user = await requireAuth(app, request);
    const { id } = z.object({ id: z.string().min(1) }).parse(request.params);
    const post = await prisma.socialPost.findUnique({
      where: { id },
      include: { author: { select: { id: true, name: true } } }
    });
    if (!post || post.hidden) throw httpError(404, "Publicação não encontrada.");

    const existing = await prisma.socialLike.findUnique({
      where: { userId_postId: { userId: user.id, postId: id } }
    });
    if (existing) {
      await prisma.socialLike.delete({ where: { id: existing.id } });
      return { liked: false, disliked: false };
    }
    await prisma.$transaction([
      prisma.socialDislike.deleteMany({ where: { userId: user.id, postId: id } }),
      prisma.socialLike.create({ data: { userId: user.id, postId: id } })
    ]);
    if (post.authorId !== user.id) {
      await notify(post.authorId, user.name, "SOCIAL_LIKE", "Nova curtida", "curtiu sua publicação.", post.id);
    }
    return { liked: true, disliked: false };
  });

  app.post("/student/social/posts/:id/dislike", async (request) => {
    requireDatabase();
    const user = await requireAuth(app, request);
    const { id } = z.object({ id: z.string().min(1) }).parse(request.params);
    const post = await prisma.socialPost.findUnique({ where: { id } });
    if (!post || post.hidden) throw httpError(404, "Publicação não encontrada.");

    const existing = await prisma.socialDislike.findUnique({
      where: { userId_postId: { userId: user.id, postId: id } }
    });
    if (existing) {
      await prisma.socialDislike.delete({ where: { id: existing.id } });
      return { disliked: false, liked: false };
    }
    await prisma.$transaction([
      prisma.socialLike.deleteMany({ where: { userId: user.id, postId: id } }),
      prisma.socialDislike.create({ data: { userId: user.id, postId: id } })
    ]);
    return { disliked: true, liked: false };
  });

  app.get("/student/social/posts/:id/comments", async (request) => {
    requireDatabase();
    const user = await requireAuth(app, request);
    const { id } = z.object({ id: z.string().min(1) }).parse(request.params);
    const post = await prisma.socialPost.findUnique({ where: { id }, select: { id: true, hidden: true } });
    if (!post || post.hidden) throw httpError(404, "Publicação não encontrada.");
    const comments = await prisma.socialComment.findMany({
      where: { postId: id, parentId: null },
      orderBy: { createdAt: "asc" },
      include: {
        user: { select: { id: true, name: true, profile: { select: { avatarUrl: true } } } },
        likes: { where: { userId: user.id }, select: { userId: true }, take: 1 },
        _count: { select: { likes: true, replies: true } },
        replies: {
          orderBy: { createdAt: "asc" },
          include: {
            user: { select: { id: true, name: true, profile: { select: { avatarUrl: true } } } },
            likes: { where: { userId: user.id }, select: { userId: true }, take: 1 },
            _count: { select: { likes: true } }
          }
        }
      }
    });
    return { comments: comments.map((comment) => serializeComment(comment, user.id)) };
  });

  app.post("/student/social/posts/:id/comments", async (request) => {
    requireDatabase();
    const user = await requireAuth(app, request);
    const { id } = z.object({ id: z.string().min(1) }).parse(request.params);
    const { body, parentId } = z
      .object({ body: z.string().min(1).max(500), parentId: z.string().min(1).optional().nullable() })
      .parse(request.body);
    const post = await prisma.socialPost.findUnique({
      where: { id },
      include: { author: { select: { id: true } } }
    });
    if (!post || post.hidden) throw httpError(404, "Publicação não encontrada.");
    let resolvedParentId: string | null = null;
    if (parentId) {
      const parent = await prisma.socialComment.findFirst({
        where: { id: parentId, postId: id },
        select: { id: true, parentId: true, userId: true }
      });
      if (!parent) throw httpError(404, "Comentário não encontrado.");
      resolvedParentId = parent.parentId ?? parent.id;
      if (parent.userId !== user.id) {
        await notify(parent.userId, user.name, "SOCIAL_COMMENT", "Nova resposta", "respondeu ao seu comentário.", post.id);
      }
    }
    const comment = await prisma.socialComment.create({
      data: { userId: user.id, postId: id, parentId: resolvedParentId, body: body.trim() },
      include: {
        user: { select: { id: true, name: true, profile: { select: { avatarUrl: true } } } },
        likes: { where: { userId: user.id }, select: { userId: true }, take: 1 },
        _count: { select: { likes: true, replies: true } }
      }
    });
    if (!resolvedParentId && post.authorId !== user.id) {
      await notify(post.authorId, user.name, "SOCIAL_COMMENT", "Novo comentário", "comentou na sua publicação.", post.id);
    }
    return { comment: serializeComment(comment, user.id) };
  });

  app.post("/student/social/comments/:id/like", async (request) => {
    requireDatabase();
    const user = await requireAuth(app, request);
    const { id } = z.object({ id: z.string().min(1) }).parse(request.params);
    const comment = await prisma.socialComment.findUnique({ where: { id }, select: { id: true, userId: true, postId: true } });
    if (!comment) throw httpError(404, "Comentário não encontrado.");
    const existing = await prisma.socialCommentLike.findUnique({
      where: { userId_commentId: { userId: user.id, commentId: id } }
    });
    if (existing) {
      await prisma.socialCommentLike.delete({ where: { id: existing.id } });
      return { liked: false };
    }
    await prisma.socialCommentLike.create({ data: { userId: user.id, commentId: id } });
    if (comment.userId !== user.id) {
      await notify(comment.userId, user.name, "SOCIAL_LIKE", "Curtida no comentário", "curtiu seu comentário.", comment.postId);
    }
    return { liked: true };
  });

  app.get("/student/social/stories", async (request) => {
    requireDatabase();
    const user = await requireAuth(app, request);
    const now = new Date();
    await prisma.socialStory.deleteMany({ where: { expiresAt: { lte: now } } });
    const stories = await prisma.socialStory.findMany({
      where: { expiresAt: { gt: now } },
      include: {
        author: { select: { id: true, name: true, profile: { select: { avatarUrl: true } } } },
        views: { where: { userId: user.id }, select: { id: true } }
      },
      orderBy: { createdAt: "desc" },
      take: 80
    });

    const byAuthor = new Map<
      string,
      {
        userId: string;
        username: string;
        image_url: string | null;
        isMine: boolean;
        unseen: boolean;
        items: Array<{
          id: string;
          mediaUrl: string;
          mediaType: string;
          coverUrl: string | null;
          caption: string | null;
          mood: string;
          createdAt: string;
          expiresAt: string;
          seen: boolean;
        }>;
      }
    >();

    for (const story of stories) {
      const seen = story.views.length > 0;
      const item = {
        id: story.id,
        mediaUrl: story.mediaUrl,
        mediaType: story.mediaType,
        coverUrl: story.coverUrl,
        caption: story.caption,
        mood: story.mood,
        createdAt: story.createdAt.toISOString(),
        expiresAt: story.expiresAt.toISOString(),
        seen
      };
      const current = byAuthor.get(story.authorId);
      if (!current) {
        // Capa do rail: cover escolhida ou mídia do momento mais recente.
        byAuthor.set(story.authorId, {
          userId: story.authorId,
          username: story.author.name,
          image_url: story.coverUrl || story.mediaUrl,
          isMine: story.authorId === user.id,
          unseen: !seen && story.authorId !== user.id,
          items: [item]
        });
        continue;
      }
      current.items.push(item);
      if (!seen && story.authorId !== user.id) current.unseen = true;
    }

    const rails = [...byAuthor.values()]
      .map((rail) => ({
        ...rail,
        items: [...rail.items].sort((a, b) => a.createdAt.localeCompare(b.createdAt))
      }))
      .sort((a, b) => {
        if (a.isMine !== b.isMine) return a.isMine ? -1 : 1;
        if (a.unseen !== b.unseen) return a.unseen ? -1 : 1;
        return 0;
      });

    return { rails };
  });

  app.post("/student/social/stories", async (request) => {
    requireDatabase();
    const user = await requireAuth(app, request);
    const body = z
      .object({
        mediaUrl: z.string().url().or(z.string().startsWith("/")),
        mediaType: z.enum(["IMAGE", "VIDEO"]).optional().default("IMAGE"),
        coverUrl: z.string().url().or(z.string().startsWith("/")).optional().nullable(),
        caption: z.string().max(200).optional(),
        mood: z.string().max(40).optional().default("vibe")
      })
      .parse(request.body);

    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
    const story = await prisma.socialStory.create({
      data: {
        authorId: user.id,
        mediaUrl: body.mediaUrl,
        mediaType: body.mediaType,
        coverUrl: body.coverUrl?.trim() || (body.mediaType === "IMAGE" ? body.mediaUrl : null),
        caption: body.caption?.trim() || null,
        mood: body.mood,
        expiresAt
      }
    });
    return {
      story: {
        id: story.id,
        mediaUrl: story.mediaUrl,
        mediaType: story.mediaType,
        coverUrl: story.coverUrl,
        caption: story.caption,
        mood: story.mood,
        expiresAt: story.expiresAt.toISOString(),
        createdAt: story.createdAt.toISOString()
      }
    };
  });

  app.post("/student/social/stories/:id/view", async (request) => {
    requireDatabase();
    const user = await requireAuth(app, request);
    const { id } = z.object({ id: z.string().min(1) }).parse(request.params);
    const story = await prisma.socialStory.findUnique({ where: { id } });
    if (!story || story.expiresAt <= new Date()) throw httpError(404, "Momento expirado.");
    await prisma.socialStoryView.upsert({
      where: { storyId_userId: { storyId: id, userId: user.id } },
      create: { storyId: id, userId: user.id },
      update: {}
    });
    return { ok: true };
  });

  app.get("/student/social/stories/gallery", async (request) => {
    requireDatabase();
    const user = await requireAuth(app, request);
    const rows = await prisma.socialStoryGallery.findMany({
      where: { userId: user.id },
      orderBy: { savedAt: "desc" },
      take: 120
    });
    return {
      items: rows.map((row) => ({
        id: row.id,
        storyId: row.storyId,
        mediaUrl: row.mediaUrl,
        mediaType: row.mediaType,
        coverUrl: row.coverUrl,
        caption: row.caption,
        mood: row.mood,
        savedAt: row.savedAt.toISOString()
      }))
    };
  });

  app.post("/student/social/stories/:id/gallery", async (request) => {
    requireDatabase();
    const user = await requireAuth(app, request);
    const { id } = z.object({ id: z.string().min(1) }).parse(request.params);
    const story = await prisma.socialStory.findUnique({ where: { id } });
    if (!story || story.expiresAt <= new Date()) throw httpError(404, "Momento expirado ou indisponível.");
    if (story.authorId !== user.id) throw httpError(403, "Só é possível salvar seus próprios momentos.");
    const saved = await prisma.socialStoryGallery.upsert({
      where: { userId_storyId: { userId: user.id, storyId: id } },
      create: {
        userId: user.id,
        storyId: id,
        mediaUrl: story.mediaUrl,
        mediaType: story.mediaType,
        coverUrl: story.coverUrl,
        caption: story.caption,
        mood: story.mood
      },
      update: {
        mediaUrl: story.mediaUrl,
        mediaType: story.mediaType,
        coverUrl: story.coverUrl,
        caption: story.caption,
        mood: story.mood,
        savedAt: new Date()
      }
    });
    return {
      saved: true,
      item: {
        id: saved.id,
        storyId: saved.storyId,
        mediaUrl: saved.mediaUrl,
        mediaType: saved.mediaType,
        coverUrl: saved.coverUrl,
        caption: saved.caption,
        mood: saved.mood,
        savedAt: saved.savedAt.toISOString()
      }
    };
  });

  app.delete("/student/social/stories/gallery/:id", async (request) => {
    requireDatabase();
    const user = await requireAuth(app, request);
    const { id } = z.object({ id: z.string().min(1) }).parse(request.params);
    const deleted = await prisma.socialStoryGallery.deleteMany({ where: { id, userId: user.id } });
    if (!deleted.count) throw httpError(404, "Item não encontrado na galeria.");
    return { ok: true };
  });

  app.get("/student/social/me", async (request) => {
    requireDatabase();
    const user = await requireAuth(app, request);
    const [followersCount, followingCount, postsCount, profile] = await Promise.all([
      prisma.socialFollow.count({ where: { followingId: user.id } }),
      prisma.socialFollow.count({ where: { followerId: user.id } }),
      prisma.socialPost.count({ where: { authorId: user.id, hidden: false } }),
      prisma.profile.findUnique({
        where: { userId: user.id },
        select: {
          avatarUrl: true,
          isPrivate: true,
          objective: true,
          level: true,
          city: true,
          state: true,
          bio: true,
          coverColor: true,
          coverUrl: true
        }
      })
    ]);
    return {
      id: user.id,
      name: user.name,
      avatarUrl: profile?.avatarUrl ?? null,
      bio: profile?.bio ?? null,
      coverColor: profile?.coverColor ?? null,
      coverUrl: profile?.coverUrl ?? null,
      objective: profile?.objective ?? null,
      level: profile?.level ?? null,
      city: profile?.city ?? null,
      state: profile?.state ?? null,
      isPrivate: Boolean(profile?.isPrivate),
      followersCount,
      followingCount,
      postsCount
    };
  });

  app.get("/student/social/users/:id", async (request) => {
    requireDatabase();
    const user = await requireAuth(app, request);
    const { id } = z.object({ id: z.string().min(1) }).parse(request.params);
    const blocked = await prisma.socialBlock.findFirst({
      where: {
        OR: [
          { blockerId: user.id, blockedId: id },
          { blockerId: id, blockedId: user.id }
        ]
      },
      select: { id: true }
    });
    if (blocked) throw httpError(404, "Perfil indisponível.");

    const target = await prisma.user.findFirst({
      where: { id, role: "USER", deletedAt: null, status: "ACTIVE" },
      select: {
        id: true,
        name: true,
        createdAt: true,
        profile: {
          select: {
            avatarUrl: true,
            isPrivate: true,
            objective: true,
            level: true,
            city: true,
            state: true,
            bio: true,
            coverColor: true,
            coverUrl: true
          }
        }
      }
    });
    if (!target) throw httpError(404, "Atleta não encontrado.");

    const [followersCount, followingCount, postsCount, followRow, requestRow, live] = await Promise.all([
      prisma.socialFollow.count({ where: { followingId: id } }),
      prisma.socialFollow.count({ where: { followerId: id } }),
      prisma.socialPost.count({ where: { authorId: id, hidden: false } }),
      prisma.socialFollow.findUnique({
        where: { followerId_followingId: { followerId: user.id, followingId: id } }
      }),
      prisma.socialFollowRequest.findUnique({
        where: { fromId_toId: { fromId: user.id, toId: id } }
      }),
      prisma.socialLiveSession.findFirst({
        where: { hostId: id, status: "live" },
        select: { id: true, title: true, startedAt: true }
      })
    ]);

    const isMe = id === user.id;
    const following = Boolean(followRow);
    const isPrivate = Boolean(target.profile?.isPrivate);
    const canViewPosts = isMe || !isPrivate || following;

    return {
      id: target.id,
      name: target.name,
      avatarUrl: target.profile?.avatarUrl ?? null,
      bio: target.profile?.bio ?? null,
      coverColor: target.profile?.coverColor ?? null,
      coverUrl: target.profile?.coverUrl ?? null,
      objective: canViewPosts ? target.profile?.objective ?? null : null,
      level: canViewPosts ? target.profile?.level ?? null : null,
      city: canViewPosts ? target.profile?.city ?? null : null,
      state: canViewPosts ? target.profile?.state ?? null : null,
      isPrivate,
      followersCount,
      followingCount,
      postsCount: canViewPosts ? postsCount : 0,
      following,
      requested: Boolean(requestRow),
      isMe,
      canViewPosts,
      memberSince: target.createdAt.toISOString(),
      live: live
        ? { id: live.id, title: live.title, startedAt: live.startedAt.toISOString() }
        : null
    };
  });

  app.get("/student/social/people", async (request) => {
    requireDatabase();
    const user = await requireAuth(app, request);
    const query = z.object({ q: z.string().max(80).optional() }).parse(request.query);
    const search = query.q?.trim();
    const following = await prisma.socialFollow.findMany({
      where: { followerId: user.id },
      select: { followingId: true }
    });
    const followingIds = new Set(following.map((row) => row.followingId));
    const people = await prisma.user.findMany({
      where: {
        id: { not: user.id },
        role: "USER",
        deletedAt: null,
        status: "ACTIVE",
        ...(search ? { name: { contains: search, mode: "insensitive" } } : {})
      },
      select: { id: true, name: true, profile: { select: { avatarUrl: true } } },
      take: 24,
      orderBy: { createdAt: "desc" }
    });
    return {
      people: people.map((person) => ({
        ...authorCard(person),
        following: followingIds.has(person.id)
      }))
    };
  });

  app.post("/student/social/users/:id/follow", async (request) => {
    requireDatabase();
    const user = await requireAuth(app, request);
    const { id } = z.object({ id: z.string().min(1) }).parse(request.params);
    if (id === user.id) throw httpError(400, "Você não pode seguir a si mesmo.");
    const target = await prisma.user.findUnique({
      where: { id },
      select: { id: true, profile: { select: { isPrivate: true } } }
    });
    if (!target) throw httpError(404, "Aluno não encontrado.");
    const existing = await prisma.socialFollow.findUnique({
      where: { followerId_followingId: { followerId: user.id, followingId: id } }
    });
    if (existing) {
      await prisma.socialFollow.delete({ where: { id: existing.id } });
      await prisma.socialFollowRequest.deleteMany({ where: { fromId: user.id, toId: id } });
      return { following: false, requested: false };
    }
    if (target.profile?.isPrivate) {
      const requestRow = await prisma.socialFollowRequest.findUnique({
        where: { fromId_toId: { fromId: user.id, toId: id } }
      });
      if (requestRow) {
        await prisma.socialFollowRequest.delete({ where: { id: requestRow.id } });
        return { following: false, requested: false };
      }
      await prisma.socialFollowRequest.create({ data: { fromId: user.id, toId: id } });
      await notify(id, user.name, "SOCIAL_FOLLOW_REQUEST", "Pedido para seguir", "quer seguir você.", user.id);
      return { following: false, requested: true };
    }
    await prisma.socialFollow.create({ data: { followerId: user.id, followingId: id } });
    await notify(id, user.name, "SOCIAL_FOLLOW", "Novo seguidor", "começou a seguir você.", user.id);
    return { following: true, requested: false };
  });

  app.post("/student/social/uploads", { config: { rateLimit: { max: 12, timeWindow: "1 minute" } } }, async (request, reply) => {
    requireDatabase();
    await requireAuth(app, request);
    const file = await request.file({
      limits: { fileSize: 200 * 1024 * 1024, files: 1 }
    });
    if (!file) return reply.code(400).send({ error: "Selecione uma foto ou vídeo." });

    const isVideo = isVideoUpload(file.filename, file.mimetype);
    const group = isVideo ? "lessons" : "images";
    const targetDir = resolve(uploadsDir, group);
    mkdirSync(targetDir, { recursive: true });
    const baseFilename = `${Date.now()}-${randomUUID()}`;
    const targetPath = resolve(targetDir, baseFilename);
    const extension = await saveValidatedUpload(file.file, targetPath, group, file.mimetype, file.filename);
    if (!extension) return reply.code(400).send({ error: "Tipo de arquivo não permitido." });

    let storedFilename = `${baseFilename}.${extension}`;
    let mimeType = file.mimetype;
    let relativePath = `${group}/${storedFilename}`;
    let absolutePath = resolve(targetDir, storedFilename);

    if (isVideo) {
      try {
        const video = await ensureUploadedVideoIsMp4({
          rawPath: targetPath,
          extension,
          group,
          baseFilename,
          forceCompatible: true,
          allowOriginalFallback: false
        });
        storedFilename = video.filename;
        mimeType = video.mimeType;
        relativePath = video.relativePath;
        absolutePath = video.absolutePath;
      } catch (err) {
        request.log.warn({ err, extension, filename: file.filename }, "social video normalization failed");
        return reply.code(422).send({
          error: "O arquivo é um vídeo, mas o codec não pôde ser convertido. Tente exportá-lo novamente."
        });
      }
    } else if (isImageUploadExtension(extension)) {
      const optimized = await optimizeUploadedImage({
        absolutePath: targetPath,
        group: "images",
        baseFilename,
        extension,
        maxEdge: 1600,
        quality: 78
      });
      storedFilename = optimized.filename;
      mimeType = optimized.mimeType;
      relativePath = optimized.relativePath;
      absolutePath = optimized.absolutePath;
    } else {
      const { rename } = await import("node:fs/promises");
      await rename(targetPath, absolutePath);
    }

    const publicUrl = await persistUploadedFile({
      relativePath,
      absolutePath,
      mimeType
    });

    return reply.code(201).send({
      file: {
        originalName: file.filename,
        filename: storedFilename,
        mimeType,
        mediaType: isVideo ? "VIDEO" : "IMAGE",
        url: publicUrl,
        path: relativePath
      }
    });
  });

  app.get("/student/social/challenges", async (request) => {
    requireDatabase();
    const user = await requireAuth(app, request);
    await ensureDefaultChallenges();
    const query = z
      .object({
        lat: z.coerce.number().min(-90).max(90).optional(),
        lng: z.coerce.number().min(-180).max(180).optional()
      })
      .parse(request.query ?? {});
    const localCell =
      query.lat != null && query.lng != null ? latLngToCell(query.lat, query.lng, 9) : null;
    const nearbyDisk = localCell ? cellDisk(localCell, 2) : null;
    const challenges = await prisma.clubChallenge.findMany({
      where: {
        isActive: true,
        ...(nearbyDisk
          ? { OR: [{ cellH3: null }, { cellH3: { in: nearbyDisk } }] }
          : {})
      },
      include: { memberships: { where: { userId: user.id }, take: 1 } },
      orderBy: { createdAt: "asc" }
    });
    const activities = await prisma.outdoorActivity.findMany({
      where: { userId: user.id, status: "COMPLETED" },
      select: {
        id: true,
        sport: true,
        distanceMeters: true,
        finishedAt: true,
        cells: { select: { cell: true, resolution: true }, where: { resolution: 9 } }
      }
    });
    return {
      challenges: challenges.map((challenge) => {
        const from = periodStart(challenge.period);
        const disk = challenge.cellH3 ? cellDisk(challenge.cellH3, 2) : null;
        const diskSet = disk ? new Set(disk) : null;
        const progress = activities
          .filter((item) => {
            if (item.sport !== challenge.sport || !item.finishedAt || item.finishedAt < from) return false;
            if (!diskSet) return true;
            return item.cells.some((c) => diskSet.has(c.cell));
          })
          .reduce((sum, item) => sum + item.distanceMeters, 0);
        return {
          id: challenge.id,
          slug: challenge.slug,
          title: challenge.title,
          description: challenge.description,
          sport: challenge.sport,
          sportLabel: sportLabel(challenge.sport),
          goalMeters: challenge.goalMeters,
          period: challenge.period,
          cellH3: challenge.cellH3 ?? null,
          scopedLocal: Boolean(challenge.cellH3),
          joined: challenge.memberships.length > 0,
          progressMeters: progress,
          percent: Math.min(100, Math.round((progress / challenge.goalMeters) * 100))
        };
      })
    };
  });

  app.post("/student/social/challenges/:id/join", async (request) => {
    requireDatabase();
    const user = await requireAuth(app, request);
    const { id } = z.object({ id: z.string().min(1) }).parse(request.params);
    const challenge = await prisma.clubChallenge.findUnique({ where: { id } });
    if (!challenge || !challenge.isActive) throw httpError(404, "Desafio não encontrado.");
    await prisma.clubMembership.upsert({
      where: { userId_challengeId: { userId: user.id, challengeId: id } },
      update: {},
      create: { userId: user.id, challengeId: id }
    });
    return { joined: true };
  });

  app.get("/student/activities/live", async (request) => {
    requireDatabase();
    const user = await requireAuth(app, request);
    const live = await prisma.outdoorActivity.findFirst({
      where: { userId: user.id, status: { in: ["LIVE", "PAUSED"] } },
      orderBy: { startedAt: "desc" }
    });
    return { activity: live ? serializeActivity(live) : null };
  });

  app.get("/student/activities/heatmap", async (request) => {
    requireDatabase();
    const user = await requireAuth(app, request);
    const query = z
      .object({ scope: z.enum(["global", "weekly", "night", "personal"]).default("personal") })
      .parse(request.query);
    const now = new Date();
    const from =
      query.scope === "weekly"
        ? new Date(now.getTime() - 7 * 24 * 3600 * 1000)
        : query.scope === "personal"
          ? new Date(now.getTime() - 90 * 24 * 3600 * 1000)
          : new Date(now.getTime() - 30 * 24 * 3600 * 1000);

    const rows = await prisma.outdoorActivity.findMany({
      where: {
        status: "COMPLETED",
        finishedAt: { gte: from },
        ...(query.scope === "personal" ? { userId: user.id } : {})
      },
      select: { polyline: true, startedAt: true, sport: true },
      take: 80,
      orderBy: { finishedAt: "desc" }
    });

    const tracks = rows
      .filter((row) => query.scope !== "night" || row.startedAt.getHours() >= 18 || row.startedAt.getHours() < 6)
      .map((row) =>
        sanitizePoints(row.polyline).map((point) => ({ lat: point.lat, lng: point.lng }))
      )
      .filter((track) => track.length > 1);

    const cellRows = await prisma.outdoorActivityCell.findMany({
      where: {
        resolution: 9,
        finishedAt: { gte: from },
        ...(query.scope === "personal" ? { userId: user.id } : {})
      },
      select: { cell: true, distanceMeters: true, activityId: true },
      take: 5000
    });

    const byCell = new Map<string, { cell: string; weight: number; activities: number }>();
    const seen = new Set<string>();
    for (const row of cellRows) {
      const key = `${row.cell}:${row.activityId}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const prev = byCell.get(row.cell);
      if (prev) {
        prev.weight += row.distanceMeters;
        prev.activities += 1;
      } else {
        byCell.set(row.cell, { cell: row.cell, weight: row.distanceMeters, activities: 1 });
      }
    }

    const cells = [...byCell.values()]
      .map((row) => {
        const center = cellToLatLng(row.cell);
        if (!center) return null;
        return {
          cell: row.cell,
          lat: center.lat,
          lng: center.lng,
          weight: row.weight,
          activities: row.activities
        };
      })
      .filter((row): row is NonNullable<typeof row> => Boolean(row))
      .sort((a, b) => b.weight - a.weight)
      .slice(0, 400);

    return { tracks, cells };
  });

  app.post("/student/activities", async (request) => {
    requireDatabase();
    const user = await requireAuth(app, request);
    const body = z
      .object({
        sport: sportSchema,
        mapType: mapTypeSchema.optional(),
        activityMap: activityMapSchema.optional(),
        layers: layersSchema,
        is3d: z.boolean().optional(),
        targetDistanceMeters: z.number().positive().max(200000).optional(),
        goals: goalsSchema
      })
      .parse(request.body);

    const current = await prisma.outdoorActivity.findFirst({
      where: { userId: user.id, status: { in: ["LIVE", "PAUSED"] } }
    });
    if (current) {
      if (current.status === "PAUSED") {
        const extra = current.pausedAt ? Date.now() - current.pausedAt.getTime() : 0;
        const updated = await prisma.outdoorActivity.update({
          where: { id: current.id },
          data: {
            status: "LIVE",
            pausedAt: null,
            pauseMs: current.pauseMs + Math.max(0, extra),
            sport: body.sport,
            mapType: body.mapType ?? current.mapType,
            activityMap: body.activityMap ?? current.activityMap,
            layers: withGoals(body.layers ?? current.layers, body.goals ?? extractGoals(current.layers)),
            is3d: body.is3d ?? current.is3d
          }
        });
        return { activity: serializeActivity(updated), resumed: true };
      }
      return { activity: serializeActivity(current), resumed: true };
    }

    const distanceKm = body.goals?.distanceKm;
    const activity = await prisma.outdoorActivity.create({
      data: {
        userId: user.id,
        sport: body.sport,
        mapType: body.mapType ?? "standard",
        activityMap: body.activityMap ?? "personal",
        layers: withGoals(body.layers ?? { pois: true }, body.goals ?? null),
        is3d: body.is3d ?? false,
        targetDistanceMeters: body.targetDistanceMeters ?? (distanceKm ? distanceKm * 1000 : null),
        polyline: []
      }
    });
    return { activity: serializeActivity(activity), resumed: false };
  });

  app.post("/student/activities/:id/points", async (request) => {
    requireDatabase();
    const user = await requireAuth(app, request);
    const { id } = z.object({ id: z.string().min(1) }).parse(request.params);
    const { points } = z.object({ points: z.array(pointSchema).min(1).max(250) }).parse(request.body);
    const activity = await prisma.outdoorActivity.findFirst({
      where: { id, userId: user.id, status: { in: ["LIVE", "PAUSED"] } }
    });
    if (!activity) throw httpError(404, "Atividade não encontrada.");

    const merged = sanitizePoints([...(sanitizePoints(activity.polyline) as GpsPoint[]), ...points]).slice(-20000);
    const stats = buildStravaSummary(activity.sport, activity.startedAt, merged, activity.pauseMs, {
      is3d: activity.is3d,
      mapType: activity.mapType
    });
    const updated = await prisma.outdoorActivity.update({
      where: { id },
      data: {
        polyline: merged,
        distanceMeters: stats.distanceMeters,
        elapsedSeconds: stats.elapsedSeconds,
        movingSeconds: stats.movingSeconds,
        avgPaceSecPerKm: stats.avgPaceSecPerKm,
        avgSpeedMps: stats.avgSpeedMps,
        maxSpeedMps: stats.maxSpeedMps,
        elevationGainMeters: stats.elevationGainMeters,
        calories: stats.calories
      }
    });
    return { activity: serializeActivity(updated) };
  });

  async function ownLive(request: FastifyRequest, id: string) {
    const user = await requireAuth(app, request);
    const activity = await prisma.outdoorActivity.findFirst({ where: { id, userId: user.id } });
    if (!activity) throw httpError(404, "Atividade não encontrada.");
    return { user, activity };
  }

  app.post("/student/activities/:id/goals", async (request) => {
    requireDatabase();
    const { id } = z.object({ id: z.string().min(1) }).parse(request.params);
    const { activity } = await ownLive(request, id);
    const { goals } = z.object({ goals: goalsSchema }).parse(request.body);
    const updated = await prisma.outdoorActivity.update({
      where: { id },
      data: {
        layers: withGoals(activity.layers, goals ?? null),
        targetDistanceMeters: goals?.distanceKm ? goals.distanceKm * 1000 : activity.targetDistanceMeters
      }
    });
    return { activity: serializeActivity(updated) };
  });

  app.post("/student/activities/:id/pause", async (request) => {
    requireDatabase();
    const { id } = z.object({ id: z.string().min(1) }).parse(request.params);
    const parsed = z
      .object({ points: z.array(pointSchema).max(20000).optional() })
      .safeParse(request.body ?? {});
    const incoming = parsed.success ? parsed.data.points ?? [] : [];
    const { activity } = await ownLive(request, id);
    if (activity.status === "COMPLETED" || activity.status === "CANCELED") {
      throw httpError(409, "Atividade não está em andamento.");
    }
    if (activity.status !== "LIVE" && activity.status !== "PAUSED") {
      throw httpError(409, "Atividade não está em andamento.");
    }
    if (activity.status === "PAUSED" && !incoming.length) {
      return { activity: serializeActivity(activity) };
    }
    const merged = incoming.length
      ? sanitizePoints([...(sanitizePoints(activity.polyline) as GpsPoint[]), ...incoming]).slice(-20000)
      : null;
    const stats = merged
      ? buildStravaSummary(activity.sport, activity.startedAt, merged, activity.pauseMs, {
          is3d: activity.is3d,
          mapType: activity.mapType
        })
      : null;
    const updated = await prisma.outdoorActivity.update({
      where: { id },
      data: {
        status: "PAUSED",
        pausedAt: activity.status === "PAUSED" ? activity.pausedAt ?? new Date() : new Date(),
        ...(merged && stats
          ? {
              polyline: merged,
              distanceMeters: stats.distanceMeters,
              elapsedSeconds: stats.elapsedSeconds,
              movingSeconds: stats.movingSeconds,
              avgPaceSecPerKm: stats.avgPaceSecPerKm,
              avgSpeedMps: stats.avgSpeedMps,
              maxSpeedMps: stats.maxSpeedMps,
              elevationGainMeters: stats.elevationGainMeters,
              calories: stats.calories
            }
          : {})
      }
    });
    return { activity: serializeActivity(updated) };
  });

  app.post("/student/activities/:id/resume", async (request) => {
    requireDatabase();
    const { id } = z.object({ id: z.string().min(1) }).parse(request.params);
    const { activity } = await ownLive(request, id);
    if (activity.status === "LIVE") return { activity: serializeActivity(activity) };
    if (activity.status !== "PAUSED") throw httpError(409, "Atividade não está pausada.");
    const extra = activity.pausedAt ? Date.now() - activity.pausedAt.getTime() : 0;
    const updated = await prisma.outdoorActivity.update({
      where: { id },
      data: { status: "LIVE", pausedAt: null, pauseMs: activity.pauseMs + Math.max(0, extra) }
    });
    return { activity: serializeActivity(updated) };
  });

  app.post("/student/activities/:id/cancel", async (request) => {
    requireDatabase();
    const { id } = z.object({ id: z.string().min(1) }).parse(request.params);
    const { activity } = await ownLive(request, id);
    if (activity.status === "COMPLETED") throw httpError(409, "Atividade já finalizada.");
    const updated = await prisma.outdoorActivity.update({
      where: { id },
      data: { status: "CANCELED", finishedAt: new Date() }
    });
    return { activity: serializeActivity(updated) };
  });

  app.post("/student/activities/:id/finish", async (request) => {
    requireDatabase();
    const { id } = z.object({ id: z.string().min(1) }).parse(request.params);
    const { user, activity } = await ownLive(request, id);
    const body = finishBodySchema.parse(request.body ?? {});
    if (activity.status === "CANCELED") throw httpError(409, "Atividade cancelada.");
    if (activity.status === "COMPLETED") {
      return respondCompletedFinish(user, activity, body);
    }

    let pauseMs = activity.pauseMs;
    if (activity.status === "PAUSED" && activity.pausedAt) {
      pauseMs += Math.max(0, Date.now() - activity.pausedAt.getTime());
    }
    const points = sanitizePoints([...(sanitizePoints(activity.polyline) as GpsPoint[]), ...(body.points ?? [])]).slice(
      -20000
    );

    const serverAntiCheat = evaluateAntiCheat(activity.sport as OutdoorSportKind, points);
    const antiCheat = mergeAntiCheat(serverAntiCheat, body.trackingMeta?.antiCheat ?? null);
    const publishBlocked = shouldBlockPublish(antiCheat);
    const allowPublish = body.publish !== false && !publishBlocked;

    const summary = {
      ...buildStravaSummary(activity.sport, activity.startedAt, points, pauseMs, {
        is3d: body.is3d ?? activity.is3d,
        mapType: body.mapType ?? activity.mapType,
        caption: body.caption
      }),
      goals: body.goals ?? extractGoals(activity.layers),
      trackingMeta: {
        ...(body.trackingMeta ?? {}),
        antiCheat
      }
    };
    const goals = summary.goals as { laps?: unknown[] } | null;
    const lapCount = Array.isArray(goals?.laps) ? goals.laps.length : 0;
    const caption =
      body.caption?.trim() ||
      `${summary.name} · ${((summary.distanceMeters ?? 0) / 1000).toFixed(2)} km · ${sportLabel(activity.sport)}${
        lapCount ? ` · ${lapCount} volta${lapCount === 1 ? "" : "s"}` : ""
      }`;

    const finished = await prisma.$transaction(async (tx) => {
      const updated = await tx.outdoorActivity.update({
        where: { id },
        data: {
          status: "COMPLETED",
          finishedAt: new Date(),
          pauseMs,
          polyline: points,
          summary: summary as Prisma.InputJsonValue,
          elapsedSeconds: summary.elapsedSeconds,
          movingSeconds: summary.movingSeconds,
          distanceMeters: summary.distanceMeters,
          avgPaceSecPerKm: summary.avgPaceSecPerKm,
          avgSpeedMps: summary.avgSpeedMps,
          maxSpeedMps: summary.maxSpeedMps,
          elevationGainMeters: summary.elevationGainMeters,
          elevationLossMeters: summary.elevationLossMeters ?? 0,
          estimatedPowerWatts: summary.estimatedPowerWatts ?? null,
          stepsCount: body.trackingMeta?.stepsCount ?? 0,
          avgCadenceSpm: body.trackingMeta?.avgCadenceSpm ?? null,
          avgHeartRateBpm: body.trackingMeta?.avgHeartRateBpm ?? null,
          maxHeartRateBpm: body.trackingMeta?.maxHeartRateBpm ?? null,
          antiCheatScore: antiCheat.score ?? 0,
          quarantineUntil: shouldQuarantine(antiCheat)
            ? new Date(Date.now() + 7 * 24 * 3600 * 1000)
            : null,
          calories: summary.calories,
          mapType: body.mapType ?? activity.mapType,
          activityMap: body.activityMap ?? activity.activityMap,
          layers: withGoals(body.layers ?? activity.layers, body.goals ?? extractGoals(activity.layers)),
          is3d: body.is3d ?? activity.is3d,
          photoUrl: allowPublish ? body.photoUrl ?? null : null,
          videoUrl: allowPublish ? body.videoUrl ?? null : null,
          caption: allowPublish ? caption : null,
          flagged: !antiCheat.ok,
          moderationStatus: !antiCheat.ok ? "OPEN" : "NONE",
          antiCheatFlags: {
            flags: antiCheat.flags,
            score: antiCheat.score,
            ok: antiCheat.ok
          } as Prisma.InputJsonValue,
          moderationNote: null,
          moderatedAt: null
        }
      });

      const cellsR9 = body.trackingMeta?.h3r9 ?? [];
      const cellsR11 = body.trackingMeta?.h3r11 ?? [];
      const cellRows = [
        ...cellsR9.map((cell) => ({ cell, resolution: 9 })),
        ...cellsR11.map((cell) => ({ cell, resolution: 11 }))
      ];
      if (cellRows.length) {
        await tx.outdoorActivityCell.createMany({
          data: cellRows.map((row) => ({
            activityId: updated.id,
            userId: user.id,
            sport: activity.sport,
            cell: row.cell,
            resolution: row.resolution,
            distanceMeters: updated.distanceMeters,
            finishedAt: updated.finishedAt ?? new Date()
          })),
          skipDuplicates: true
        });
      }

      // Matching de segmentos nomeados (fatia D)
      const namedSegments = await tx.outdoorSegment.findMany({
        where: { sport: activity.sport, isActive: true },
        take: 80
      });
      const segmentEfforts: Array<{
        segmentId: string;
        name: string;
        elapsedSeconds: number;
        paceSecPerKm: number | null;
        isPr: boolean;
      }> = [];
      if (namedSegments.length && points.length >= 2) {
        const byId = new Map(namedSegments.map((s) => [s.id, s]));
        const matches = matchSegments(
          points,
          namedSegments.map((s) => ({
            id: s.id,
            distanceMeters: s.distanceMeters,
            startLat: s.startLat,
            startLng: s.startLng,
            endLat: s.endLat,
            endLng: s.endLng,
            polyline: (Array.isArray(s.polyline) ? s.polyline : []) as Array<{ lat: number; lng: number }>
          }))
        );
        for (const match of matches) {
          const prevBest = await tx.outdoorSegmentEffort.findFirst({
            where: { userId: user.id, segmentId: match.segmentId },
            orderBy: { elapsedSeconds: "asc" }
          });
          const isPr = !prevBest || match.elapsedSeconds < prevBest.elapsedSeconds;
          if (isPr && prevBest) {
            await tx.outdoorSegmentEffort.updateMany({
              where: { userId: user.id, segmentId: match.segmentId, isPr: true },
              data: { isPr: false }
            });
          }
          await tx.outdoorSegmentEffort.create({
            data: {
              segmentId: match.segmentId,
              activityId: updated.id,
              userId: user.id,
              elapsedSeconds: match.elapsedSeconds,
              paceSecPerKm: match.paceSecPerKm,
              isPr
            }
          });
          segmentEfforts.push({
            segmentId: match.segmentId,
            name: byId.get(match.segmentId)?.name ?? "Segmento",
            elapsedSeconds: match.elapsedSeconds,
            paceSecPerKm: match.paceSecPerKm,
            isPr
          });
        }
      }

      if (!allowPublish) return { updated, post: null, segmentEfforts };
      const mediaUrl = body.photoUrl || body.videoUrl || null;
      const post = await tx.socialPost.create({
        data: {
          authorId: user.id,
          kind: "ACTIVITY",
          body: caption,
          mediaUrl,
          mediaType: body.videoUrl ? "VIDEO" : body.photoUrl ? "IMAGE" : null,
          activityId: updated.id
        },
        include: postInclude
      });
      return { updated, post, segmentEfforts };
    });

    return {
      activity: serializeActivity(finished.updated),
      segmentEfforts: finished.segmentEfforts,
      post: finished.post ? await serializePost({ ...finished.post, activity: finished.updated }, user.id) : null,
      moderation: {
        published: allowPublish,
        blockedByAntiCheat: publishBlocked,
        antiCheat,
        quarantine: shouldQuarantine(antiCheat),
        message: antiCheatUserMessage(antiCheat)
      }
    };
  });

  app.get("/student/activities/leaderboard", async (request) => {
    requireDatabase();
    const user = await requireAuth(app, request);
    const query = z
      .object({
        lat: z.coerce.number().min(-90).max(90),
        lng: z.coerce.number().min(-180).max(180),
        sport: sportSchema.optional(),
        period: z.enum(["week", "month", "all"]).default("week"),
        resolution: z.coerce.number().int().refine((n) => n === 9 || n === 11).default(9),
        limit: z.coerce.number().int().min(1).max(50).default(20)
      })
      .parse(request.query);

    const cell = latLngToCell(query.lat, query.lng, query.resolution as 9 | 11);
    const nearbyCells = cellDisk(cell, 1);
    const now = Date.now();
    const from =
      query.period === "week"
        ? new Date(now - 7 * 24 * 3600 * 1000)
        : query.period === "month"
          ? new Date(now - 30 * 24 * 3600 * 1000)
          : null;

    const rows = await prisma.outdoorActivityCell.findMany({
      where: {
        cell: { in: nearbyCells },
        resolution: query.resolution,
        ...(query.sport ? { sport: query.sport } : {}),
        ...(from ? { finishedAt: { gte: from } } : {})
      },
      select: {
        userId: true,
        activityId: true,
        distanceMeters: true,
        sport: true,
        user: { select: { id: true, name: true, profile: { select: { avatarUrl: true } } } }
      },
      take: 2000
    });

    const byUser = new Map<
      string,
      { userId: string; name: string; avatarUrl: string | null; distanceMeters: number; activities: number; sport: string }
    >();
    const seenActivity = new Set<string>();
    for (const row of rows) {
      const key = `${row.userId}:${row.activityId}`;
      if (seenActivity.has(key)) continue;
      seenActivity.add(key);
      const prev = byUser.get(row.userId);
      if (prev) {
        prev.distanceMeters += row.distanceMeters;
        prev.activities += 1;
      } else {
        byUser.set(row.userId, {
          userId: row.userId,
          name: row.user.name,
          avatarUrl: row.user.profile?.avatarUrl ?? null,
          distanceMeters: row.distanceMeters,
          activities: 1,
          sport: row.sport
        });
      }
    }

    const ranking = [...byUser.values()]
      .sort((a, b) => b.distanceMeters - a.distanceMeters)
      .slice(0, query.limit)
      .map((row, index) => ({
        rank: index + 1,
        userId: row.userId,
        name: row.name,
        avatarUrl: row.avatarUrl,
        distanceMeters: row.distanceMeters,
        activities: row.activities,
        isMe: row.userId === user.id
      }));

    const me = ranking.find((row) => row.isMe) ?? null;

    return {
      cell,
      cells: nearbyCells,
      resolution: query.resolution,
      period: query.period,
      sport: query.sport ?? null,
      ranking,
      me
    };
  });

  app.get("/student/activities/segments/nearby", async (request) => {
    requireDatabase();
    await requireAuth(app, request);
    const query = z
      .object({
        lat: z.coerce.number().min(-90).max(90),
        lng: z.coerce.number().min(-180).max(180),
        sport: sportSchema.optional(),
        period: z.enum(["week", "month", "all"]).default("week"),
        limit: z.coerce.number().int().min(1).max(30).default(10)
      })
      .parse(request.query);

    const center = latLngToCell(query.lat, query.lng, 9);
    const nearbyCells = cellDisk(center, 2);
    const now = Date.now();
    const from =
      query.period === "week"
        ? new Date(now - 7 * 24 * 3600 * 1000)
        : query.period === "month"
          ? new Date(now - 30 * 24 * 3600 * 1000)
          : null;

    const rows = await prisma.outdoorActivityCell.findMany({
      where: {
        resolution: 9,
        cell: { in: nearbyCells },
        ...(query.sport ? { sport: query.sport } : {}),
        ...(from ? { finishedAt: { gte: from } } : {})
      },
      select: { cell: true, distanceMeters: true, activityId: true },
      take: 5000
    });

    const byCell = new Map<string, { cell: string; distanceMeters: number; activities: number }>();
    const seen = new Set<string>();
    for (const row of rows) {
      const key = `${row.cell}:${row.activityId}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const prev = byCell.get(row.cell);
      if (prev) {
        prev.distanceMeters += row.distanceMeters;
        prev.activities += 1;
      } else {
        byCell.set(row.cell, { cell: row.cell, distanceMeters: row.distanceMeters, activities: 1 });
      }
    }

    const segments = [...byCell.values()]
      .sort((a, b) => {
        if (a.cell === center) return -1;
        if (b.cell === center) return 1;
        return b.activities - a.activities || b.distanceMeters - a.distanceMeters;
      })
      .slice(0, query.limit)
      .map((row) => ({
        ...row,
        isCurrent: row.cell === center
      }));

    return { centerCell: center, segments };
  });

  /** Segmentos nomeados próximos (polyline) */
  app.get("/student/activities/named-segments/nearby", async (request) => {
    requireDatabase();
    await requireAuth(app, request);
    const query = z
      .object({
        lat: z.coerce.number().min(-90).max(90),
        lng: z.coerce.number().min(-180).max(180),
        sport: sportSchema.optional(),
        limit: z.coerce.number().int().min(1).max(40).default(15)
      })
      .parse(request.query);

    const cell = latLngToCell(query.lat, query.lng, 9);
    const disk = cellDisk(cell, 2);
    const rows = await prisma.outdoorSegment.findMany({
      where: {
        isActive: true,
        ...(query.sport ? { sport: query.sport } : {}),
        OR: [{ cellH3: { in: disk } }, { cellH3: null }]
      },
      orderBy: { distanceMeters: "asc" },
      take: query.limit
    });

    return {
      centerCell: cell,
      segments: rows.map((s) => ({
        id: s.id,
        slug: s.slug,
        name: s.name,
        sport: s.sport,
        description: s.description,
        distanceMeters: s.distanceMeters,
        start: { lat: s.startLat, lng: s.startLng },
        end: { lat: s.endLat, lng: s.endLng },
        cellH3: s.cellH3
      }))
    };
  });

  app.post("/student/activities/named-segments", async (request) => {
    requireDatabase();
    const user = await requireAuth(app, request);
    const body = z
      .object({
        name: z.string().min(2).max(80),
        sport: sportSchema,
        description: z.string().max(500).optional(),
        polyline: z
          .array(z.object({ lat: z.number(), lng: z.number() }))
          .min(2)
          .max(2000)
      })
      .parse(request.body ?? {});

    const polyline = body.polyline;
    const distanceMeters = polylineDistance(polyline);
    const start = polyline[0]!;
    const end = polyline[polyline.length - 1]!;
    const slug = `${body.sport.toLowerCase()}-${body.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 40)}-${Date.now().toString(36)}`;

    const segment = await prisma.outdoorSegment.create({
      data: {
        slug,
        name: body.name,
        sport: body.sport,
        description: body.description ?? null,
        polyline,
        distanceMeters,
        startLat: start.lat,
        startLng: start.lng,
        endLat: end.lat,
        endLng: end.lng,
        cellH3: segmentCellFromPolyline(polyline)
      }
    });

    return { segment, createdBy: user.id };
  });

  app.get("/student/activities/named-segments/:id/leaderboard", async (request) => {
    requireDatabase();
    await requireAuth(app, request);
    const { id } = z.object({ id: z.string().min(1) }).parse(request.params);
    const efforts = await prisma.outdoorSegmentEffort.findMany({
      where: { segmentId: id },
      orderBy: { elapsedSeconds: "asc" },
      take: 50,
      include: { user: { select: { id: true, name: true } } }
    });
    return {
      leaderboard: efforts.map((e, i) => ({
        rank: i + 1,
        userId: e.userId,
        name: e.user.name,
        elapsedSeconds: e.elapsedSeconds,
        paceSecPerKm: e.paceSecPerKm,
        isPr: e.isPr,
        activityId: e.activityId
      }))
    };
  });
}
