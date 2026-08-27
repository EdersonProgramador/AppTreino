import { apiPost } from "../../auth/api";
import { localStore } from "../db/LocalStore";

export type OutboxRow = {
  id: number;
  sessionId: string;
  kind: string;
  payload: Record<string, unknown>;
  attempts: number;
};

type PointsPayload = {
  serverId: string;
  points: Array<{ lat: number; lng: number; t: number; ele?: number | null }>;
};

type FinishPayload = PointsPayload & {
  compressedCount?: number;
  rawCount?: number;
  maskedCount?: number;
  h3r9?: string[];
  h3r11?: string[];
  antiCheat?: Record<string, unknown> | { ok?: boolean; flags?: string[]; score?: number };
  privacy?: Record<string, unknown> | { homeRadiusM?: number; masked?: boolean };
  distanceM?: number;
  movingTimeMs?: number;
  stepsCount?: number;
  avgCadenceSpm?: number | null;
  avgHeartRateBpm?: number | null;
  maxHeartRateBpm?: number | null;
  publish?: boolean;
  caption?: string;
  photoUrl?: string | null;
  videoUrl?: string | null;
};

/**
 * Drena tracking_outbox → API.
 * POINTS  → POST /student/activities/:id/points
 * FINISH  → points + retry de /finish (idempotente se já COMPLETED)
 */
export class OutboxSync {
  private running = false;

  async enqueuePoints(
    sessionId: string,
    serverId: string,
    points: Array<{ lat: number; lng: number; t: number; ele?: number | null }>
  ) {
    if (!points.length || !serverId) return;
    await localStore.enqueueOutbox(sessionId, "POINTS", { serverId, points } satisfies PointsPayload);
  }

  async enqueueFinish(sessionId: string, serverId: string, payload: Omit<FinishPayload, "serverId">) {
    if (!serverId) return;
    await localStore.enqueueOutbox(sessionId, "FINISH", { serverId, ...payload });
  }

  async flush(token: string): Promise<{ synced: number; failed: number }> {
    if (this.running) return { synced: 0, failed: 0 };
    this.running = true;
    let synced = 0;
    let failed = 0;
    try {
      const rows = await localStore.listDueOutbox(Date.now(), 20);
      for (const row of rows) {
        try {
          await this.dispatch(
            {
              id: row.id,
              sessionId: row.sessionId,
              kind: row.kind,
              payload: row.payload,
              attempts: row.attempts
            },
            token
          );
          await localStore.deleteOutbox(row.id);
          synced += 1;
        } catch {
          const attempts = row.attempts + 1;
          const backoffMs = Math.min(60_000, 2_000 * 2 ** Math.min(attempts, 5));
          await localStore.bumpOutbox(row.id, attempts, Date.now() + backoffMs);
          failed += 1;
        }
      }
    } finally {
      this.running = false;
    }
    return { synced, failed };
  }

  private async dispatch(row: OutboxRow, token: string) {
    const payload = row.payload as Partial<FinishPayload>;
    const serverId = String(payload.serverId ?? "");
    const points = Array.isArray(payload.points) ? payload.points : [];
    if (!serverId) throw new Error("Outbox sem serverId.");

    if (row.kind === "POINTS") {
      if (!points.length) return;
      for (let i = 0; i < points.length; i += 200) {
        await apiPost(`/student/activities/${serverId}/points`, { points: points.slice(i, i + 200) }, token);
      }
      return;
    }

    if (row.kind === "FINISH") {
      try {
        await apiPost(
          `/student/activities/${serverId}/finish`,
          {
            points,
            publish: payload.publish === true,
            ...(payload.caption ? { caption: payload.caption } : {}),
            ...(payload.photoUrl ? { photoUrl: payload.photoUrl } : {}),
            ...(payload.videoUrl ? { videoUrl: payload.videoUrl } : {}),
            trackingMeta: {
              rawCount: payload.rawCount,
              compressedCount: payload.compressedCount,
              maskedCount: payload.maskedCount,
              h3r9: payload.h3r9,
              h3r11: payload.h3r11,
              antiCheat: payload.antiCheat
                ? {
                    ok: Boolean((payload.antiCheat as { ok?: boolean }).ok),
                    flags: Array.isArray((payload.antiCheat as { flags?: unknown }).flags)
                      ? (payload.antiCheat as { flags: string[] }).flags
                      : [],
                    score: (payload.antiCheat as { score?: number }).score
                  }
                : undefined,
              privacy: payload.privacy,
              distanceM: payload.distanceM,
              movingTimeMs: payload.movingTimeMs,
              stepsCount:
                typeof payload.stepsCount === "number" && Number.isFinite(payload.stepsCount)
                  ? Math.max(0, Math.round(payload.stepsCount))
                  : undefined,
              avgCadenceSpm: payload.avgCadenceSpm,
              avgHeartRateBpm: payload.avgHeartRateBpm,
              maxHeartRateBpm: payload.maxHeartRateBpm
            }
          },
          token
        );
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        // Já finalizada no fluxo online — ok
        if (/já finaliz|already|409/i.test(msg)) return;
        throw err;
      }
      return;
    }

    throw new Error(`Outbox kind desconhecido: ${row.kind}`);
  }
}

export const outboxSync = new OutboxSync();
