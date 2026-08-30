import { useCallback, useEffect, useMemo, useState } from "react";
import { Flag, Loader2, RefreshCw, ShieldAlert, ShieldCheck, Upload } from "lucide-react";
import { apiGet, apiPost } from "../../api";
import { dataRowClass, panelTitleClass } from "../../lib/admin-cms-classes";

type ModerationStatus = "NONE" | "OPEN" | "CLEARED" | "REJECTED";

type FlaggedActivity = {
  id: string;
  sport: string;
  distanceMeters: number;
  elapsedSeconds: number;
  finishedAt: string | null;
  caption: string | null;
  flagged: boolean;
  moderationStatus: ModerationStatus;
  antiCheatFlags: string[];
  antiCheatScore?: number;
  quarantineUntil?: string | null;
  moderationNote: string | null;
  moderatedAt: string | null;
  pointCount: number;
  hasPost: boolean;
  postId: string | null;
  user: {
    id: string;
    name: string;
    email: string | null;
    avatarUrl: string | null;
  };
};

type Props = {
  token: string;
};

function formatKm(meters: number) {
  return `${(meters / 1000).toFixed(2)} km`;
}

function formatDuration(seconds: number) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}h ${String(m).padStart(2, "0")}m`;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function ReplaySvg({ points }: { points: Array<{ lat: number; lng: number }> }) {
  const lats = points.map((p) => p.lat);
  const lngs = points.map((p) => p.lng);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLng = Math.min(...lngs);
  const maxLng = Math.max(...lngs);
  const w = 640;
  const h = 240;
  const pad = 12;
  const dx = Math.max(1e-6, maxLng - minLng);
  const dy = Math.max(1e-6, maxLat - minLat);
  const path = points
    .map((p, i) => {
      const x = pad + ((p.lng - minLng) / dx) * (w - pad * 2);
      const y = pad + ((maxLat - p.lat) / dy) * (h - pad * 2);
      return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="h-56 w-full" role="img" aria-label="Replay da polyline">
      <rect width={w} height={h} fill="rgba(0,0,0,0.25)" rx="12" />
      <path d={path} fill="none" stroke="#d4af37" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
      <circle
        cx={pad + ((points[0]!.lng - minLng) / dx) * (w - pad * 2)}
        cy={pad + ((maxLat - points[0]!.lat) / dy) * (h - pad * 2)}
        r="5"
        fill="#22c55e"
      />
      <circle
        cx={pad + ((points[points.length - 1]!.lng - minLng) / dx) * (w - pad * 2)}
        cy={pad + ((maxLat - points[points.length - 1]!.lat) / dy) * (h - pad * 2)}
        r="5"
        fill="#ef4444"
      />
    </svg>
  );
}

export function OutdoorModerationAdminPanel({ token }: Props) {
  const [status, setStatus] = useState<"OPEN" | "CLEARED" | "REJECTED" | "ALL">("OPEN");
  const [activities, setActivities] = useState<FlaggedActivity[]>([]);
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [replayId, setReplayId] = useState<string | null>(null);
  const [replayInfo, setReplayInfo] = useState<string | null>(null);
  const [replayPolyline, setReplayPolyline] = useState<Array<{ lat: number; lng: number }> | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiGet<{ activities: FlaggedActivity[] }>(
        `/admin/outdoor-activities/flagged?status=${status}&limit=50`,
        token
      );
      setActivities(data.activities);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao carregar atividades.");
    } finally {
      setLoading(false);
    }
  }, [status, token]);

  useEffect(() => {
    void load();
  }, [load]);

  const openCount = useMemo(
    () => activities.filter((item) => item.moderationStatus === "OPEN").length,
    [activities]
  );

  async function loadReplay(id: string) {
    setReplayId(id);
    setReplayInfo(null);
    setReplayPolyline(null);
    try {
      const data = await apiGet<{
        pointCount: number;
        antiCheatScore: number;
        quarantineUntil: string | null;
        antiCheatFlags: string[];
        polyline?: Array<{ lat: number; lng: number }>;
      }>(`/admin/outdoor-activities/${id}/replay`, token);
      const poly = Array.isArray(data.polyline)
        ? data.polyline
            .filter((p) => typeof p?.lat === "number" && typeof p?.lng === "number")
            .map((p) => ({ lat: p.lat, lng: p.lng }))
        : [];
      setReplayPolyline(poly);
      setReplayInfo(
        `Replay ${id}: ${data.pointCount ?? poly.length} pts · score ${data.antiCheatScore}` +
          (data.quarantineUntil ? ` · quarentena até ${new Date(data.quarantineUntil).toLocaleString("pt-BR")}` : "") +
          (data.antiCheatFlags?.length ? ` · ${data.antiCheatFlags.join(", ")}` : "")
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao carregar replay.");
    }
  }

  async function moderate(id: string, action: "clear" | "reject" | "publish") {
    setBusyId(id);
    setFeedback(null);
    setError(null);
    try {
      await apiPost(`/admin/outdoor-activities/${id}/moderate`, { action }, token);
      setFeedback(
        action === "reject"
          ? "Atividade rejeitada."
          : action === "publish"
            ? "Atividade publicada no feed."
            : "Atividade liberada."
      );
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao moderar.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <section className="admin-grid phase-three-grid" id="admin-outdoor-moderation">
      <article className="table-panel">
        <div className={panelTitleClass}>
          <div>
            <h2>Moderação outdoor</h2>
            <p>Atividades GPS com flags de anti-cheat (teleporte, velocidade impossível, etc.).</p>
          </div>
          <div className="flex items-center gap-2">
            <span>{openCount} abertas nesta lista</span>
            <button type="button" className="dash-link-button" onClick={() => void load()} disabled={loading}>
              {loading ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
              Atualizar
            </button>
          </div>
        </div>

        <div className="mb-4 flex flex-wrap gap-2">
          {(["OPEN", "CLEARED", "REJECTED", "ALL"] as const).map((item) => (
            <button
              key={item}
              type="button"
              className={`rounded-xl border px-3 py-2 text-xs font-extrabold transition ${
                status === item
                  ? "border-brand-gold/50 bg-brand-gold/20 text-sand"
                  : "border-[color:var(--app-border)] bg-[var(--app-fill)] text-sand-muted"
              }`}
              onClick={() => setStatus(item)}
            >
              {item === "OPEN"
                ? "Abertas"
                : item === "CLEARED"
                  ? "Liberadas"
                  : item === "REJECTED"
                    ? "Rejeitadas"
                    : "Todas"}
            </button>
          ))}
        </div>

        {feedback ? <p className="mb-3 text-sm font-bold text-emerald-300">{feedback}</p> : null}
        {error ? <p className="mb-3 text-sm font-bold text-rose-300">{error}</p> : null}
        {replayInfo ? <p className="mb-3 text-sm font-bold text-sky-300">{replayInfo}</p> : null}
        {replayPolyline && replayPolyline.length > 1 ? (
          <div className="mb-4 overflow-hidden rounded-xl border border-[color:var(--app-border)] bg-[var(--app-fill)] p-3">
            <ReplaySvg points={replayPolyline} />
          </div>
        ) : null}

        {loading && activities.length === 0 ? (
          <div className="dash-empty">
            <Loader2 size={18} className="animate-spin" />
            Carregando...
          </div>
        ) : activities.length === 0 ? (
          <div className="dash-empty">
            <ShieldCheck size={18} />
            Nenhuma atividade neste filtro.
          </div>
        ) : (
          activities.map((item) => (
            <div className={dataRowClass} key={item.id}>
              <span>
                <strong>
                  {item.user.name} · {item.sport} · {formatKm(item.distanceMeters)}
                </strong>
                {item.user.email ?? "sem e-mail"} · {formatDuration(item.elapsedSeconds)} ·{" "}
                {item.finishedAt ? new Date(item.finishedAt).toLocaleString("pt-BR") : "—"}
                <small>
                  Status: {item.moderationStatus}
                  {item.hasPost ? " · no feed" : " · sem post"}
                  {typeof item.antiCheatScore === "number" ? ` · score ${item.antiCheatScore}` : ""}
                  {item.quarantineUntil
                    ? ` · quarentena ${new Date(item.quarantineUntil).toLocaleString("pt-BR")}`
                    : ""}
                  {item.antiCheatFlags.length
                    ? ` · flags: ${item.antiCheatFlags.join(", ")}`
                    : " · sem flags"}
                  {item.moderationNote ? ` · nota: ${item.moderationNote}` : ""}
                </small>
              </span>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  className="dash-link-button"
                  disabled={replayId === item.id}
                  onClick={() => void loadReplay(item.id)}
                >
                  Replay
                </button>
                {item.moderationStatus === "OPEN" || item.flagged ? (
                  <>
                    <button
                      type="button"
                      className="dash-link-button"
                      disabled={busyId === item.id}
                      onClick={() => void moderate(item.id, "clear")}
                    >
                      <ShieldCheck size={14} />
                      Liberar
                    </button>
                    <button
                      type="button"
                      className="dash-link-button"
                      disabled={busyId === item.id}
                      onClick={() => void moderate(item.id, "publish")}
                    >
                      <Upload size={14} />
                      Publicar
                    </button>
                    <button
                      type="button"
                      className="dash-link-button"
                      disabled={busyId === item.id}
                      onClick={() => void moderate(item.id, "reject")}
                    >
                      <ShieldAlert size={14} />
                      Rejeitar
                    </button>
                  </>
                ) : (
                  <span className="inline-flex items-center gap-1 text-xs text-sand-muted">
                    <Flag size={12} />
                    {item.moderationStatus}
                  </span>
                )}
              </div>
            </div>
          ))
        )}
      </article>
    </section>
  );
}
