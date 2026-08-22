import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import { toast } from "react-toastify";
import { api } from "@/lib";
import { TreinoPage, Panel, PrimaryButton, GhostButton } from "@/components/treino/TreinoPage";

export default function WorkoutPlayerPage() {
  const router = useRouter();
  const id = String(router.query.sessionId || "");
  const [workout, setWorkout] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const [startedAt] = useState(() => Date.now());

  useEffect(() => {
    if (!id) return;
    void api()
      .get(`/fitness/workouts/${id}`)
      .then(res => setWorkout(res.data.workout));
  }, [id]);

  async function complete() {
    setBusy(true);
    try {
      await api().post(`/fitness/workouts/${id}/complete`, {
        durationSec: Math.max(60, Math.floor((Date.now() - startedAt) / 1000))
      });
      toast.success("Treino concluído!");
      router.push("/treino/historico");
    } catch (err: any) {
      toast.error(err?.response?.data?.message || "Não foi possível salvar.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <TreinoPage
      title={workout?.title || "Player"}
      subtitle={workout?.program ? `${workout.program.title} · ${workout.focus || ""}` : "Sessão em andamento"}
      backHref={workout?.program?.id ? `/treino/${workout.program.id}` : "/treino"}
    >
      <Panel>
        <p className="mb-3 text-sm text-slate-500">Marque mentalmente cada exercício e finalize quando terminar.</p>
        <ol className="space-y-3">
          {(workout?.exercises || []).map((ex: any, index: number) => (
            <li key={ex.id} className="rounded-xl bg-mist px-3 py-3">
              <strong className="text-ink">
                {index + 1}. {ex.name}
              </strong>
              <p className="text-sm text-slate-500">
                {ex.sets} séries · {ex.reps} · descanso {ex.restSec}s
              </p>
            </li>
          ))}
        </ol>
      </Panel>
      <div className="flex flex-wrap gap-2">
        <PrimaryButton disabled={busy || !workout} onClick={() => void complete()}>
          Finalizar treino
        </PrimaryButton>
        <GhostButton onClick={() => router.back()}>Sair</GhostButton>
      </div>
    </TreinoPage>
  );
}
