import { useEffect, useState } from "react";
import Link from "@/lib/legacy-link";
import { api } from "@/lib";
import { TreinoPage, Panel } from "@/components/treino/TreinoPage";

export default function IaPage() {
  const [plan, setPlan] = useState<any>(null);

  useEffect(() => {
    void api()
      .get("/fitness/ai-plan")
      .then(res => setPlan(res.data.plan));
  }, []);

  return (
    <TreinoPage title="Plano inteligente" subtitle="Sugestão semanal com base no catálogo de treinos.">
      <Panel>
        <h2 className="text-lg font-medium text-ink">{plan?.title || "Carregando..."}</h2>
        <p className="mt-1 text-sm text-slate-500">{plan?.summary}</p>
        <p className="mt-2 text-xs uppercase text-accent">{plan?.focus}</p>
      </Panel>
      {(plan?.sessions || []).map((session: any) => (
        <Panel key={session.id}>
          <div className="flex items-center justify-between gap-3">
            <div>
              <strong className="text-ink">{session.title}</strong>
              <p className="text-sm text-slate-500">{session.focus}</p>
            </div>
            <Link href={`/treino/player/${session.id}`}>
              <a className="rounded-xl bg-brand px-3 py-2 text-sm font-medium text-white">Iniciar</a>
            </Link>
          </div>
        </Panel>
      ))}
    </TreinoPage>
  );
}
