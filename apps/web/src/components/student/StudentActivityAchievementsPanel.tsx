import { Award, Medal } from "lucide-react";
import { useEffect, useState } from "react";
import { apiGet } from "../../api";
import type { ActivityAchievementsResponse } from "../../types";

export function StudentActivityAchievementsPanel({ token }: { token: string }) {
  const [data, setData] = useState<ActivityAchievementsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void apiGet<ActivityAchievementsResponse>("/student/social/achievements", token)
      .then(setData)
      .catch((err) => setError(err instanceof Error ? err.message : "Falha ao carregar conquistas."));
  }, [token]);

  return (
    <section className="student-activity-achievements">
      <header>
        <div>
          <small>Conquistas</small>
          <h3>Selos de atividade</h3>
        </div>
        <span>
          <Award size={14} /> {data?.earned.length ?? 0}
        </span>
      </header>
      {error ? <p className="student-activity-evolution-error">{error}</p> : null}
      {(data?.earned.length ?? 0) > 0 ? (
        <div className="student-activity-achievement-grid">
          {data?.earned.map((item) => (
            <article key={item.slug} className="is-earned">
              <Medal size={18} />
              <div>
                <strong>{item.title}</strong>
                <p>{item.description}</p>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <p className="student-activity-evolution-empty">Complete corridas, caminhadas ou pedais para ganhar selos.</p>
      )}
      {(data?.pending.length ?? 0) > 0 ? (
        <div className="student-activity-achievement-pending">
          <strong>Próximas metas</strong>
          {data?.pending.slice(0, 3).map((item) => (
            <div key={item.slug}>
              <p>
                <span>{item.title}</span>
                <em>{item.percent}%</em>
              </p>
              <b>
                <i style={{ width: `${item.percent}%` }} />
              </b>
            </div>
          ))}
        </div>
      ) : null}
    </section>
  );
}
