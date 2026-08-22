import { Trophy } from "lucide-react";
import { useEffect, useState } from "react";
import { apiGet, apiPost } from "../../api";
import { formatKm } from "../../lib/activity-geo";
import type { ClubChallengeRow } from "../../types";

export function StudentClubSection({ token }: { token: string }) {
  const [challenges, setChallenges] = useState<ClubChallengeRow[]>([]);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    const data = await apiGet<{ challenges: ClubChallengeRow[] }>("/student/social/challenges", token);
    setChallenges(data.challenges);
  }

  useEffect(() => {
    void load().catch((err) => setError(err instanceof Error ? err.message : "Falha ao carregar os desafios."));
  }, [token]);

  async function join(id: string) {
    await apiPost(`/student/social/challenges/${id}/join`, {}, token);
    await load();
  }

  return (
    <section className="student-club">
      <div className="student-sheet-heading">
        <span>Desafios</span>
        <h1>Desafios da comunidade</h1>
        <p>Entre em um desafio, complete a distância na aba Corrida e o progresso aparece aqui.</p>
      </div>
      {error && <div className="error-box">{error}</div>}
      <div className="student-club-grid">
        {challenges.map((challenge) => (
          <article className="student-club-card" key={challenge.id}>
            <header>
              <Trophy size={22} />
              <div>
                <strong>{challenge.title}</strong>
                <small>{challenge.sportLabel} · {challenge.period === "WEEK" ? "Semanal" : challenge.period === "MONTH" ? "Mensal" : "Aberto"}</small>
              </div>
              <Trophy size={18} />
            </header>
            <p>{challenge.description}</p>
            <div className="student-club-progress">
              <span style={{ width: `${challenge.percent}%` }} />
            </div>
            <footer>
              <em>
                {formatKm(challenge.progressMeters)} / {formatKm(challenge.goalMeters)} km
              </em>
              {challenge.joined ? (
                <strong>Participando</strong>
              ) : (
                <button type="button" className="student-green-button" onClick={() => void join(challenge.id)}>
                  Entrar
                </button>
              )}
            </footer>
          </article>
        ))}
      </div>
    </section>
  );
}
