import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import Link from "@/lib/legacy-link";
import { api } from "@/lib";
import { TreinoPage, Panel } from "@/components/treino/TreinoPage";

export default function ProgramDetailPage() {
  const router = useRouter();
  const id = String(router.query.id || "");
  const [program, setProgram] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    void api()
      .get(`/fitness/programs/${id}`)
      .then(res => setProgram(res.data.program))
      .catch(err => setError(err?.response?.data?.message || "Programa não encontrado."));
  }, [id]);

  return (
    <TreinoPage
      title={program?.title || "Programa"}
      subtitle={program ? `${program.modality} · ${program.level}` : "Carregando..."}
      backHref="/treino"
    >
      {error ? <p className="text-sm text-red-600">{error}</p> : null}
      {program?.description ? <Panel><p className="text-sm text-slate-600">{program.description}</p></Panel> : null}
      {(program?.workouts || []).map((workout: any) => (
        <Panel key={workout.id}>
          <div className="flex items-start justify-between gap-3">
            <div>
              <strong className="text-ink">Dia {workout.dayIndex} · {workout.title}</strong>
              <p className="text-sm text-slate-500">{workout.focus} · {workout.durationMin} min</p>
              <ul className="mt-2 space-y-1 text-sm text-slate-600">
                {workout.exercises?.map((ex: any) => (
                  <li key={ex.id}>
                    {ex.name} — {ex.sets}x{ex.reps}
                  </li>
                ))}
              </ul>
            </div>
            <Link href={`/treino/player/${workout.id}`}>
              <a className="shrink-0 rounded-xl bg-brand px-3 py-2 text-sm font-medium text-white">Iniciar</a>
            </Link>
          </div>
        </Panel>
      ))}
    </TreinoPage>
  );
}
