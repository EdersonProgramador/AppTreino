import { useEffect, useState } from "react";
import { api } from "@/lib";
import { TreinoPage, Panel } from "@/components/treino/TreinoPage";

export default function FrequenciaPage() {
  const [logs, setLogs] = useState<any[]>([]);
  const [activities, setActivities] = useState<any[]>([]);

  useEffect(() => {
    void Promise.all([api().get("/fitness/history"), api().get("/fitness/activities")]).then(([h, a]) => {
      setLogs(h.data.logs || []);
      setActivities((a.data.activities || []).filter((x: any) => x.status === "FINISHED"));
    });
  }, []);

  const weekCount = logs.filter(log => Date.now() - new Date(log.startedAt).getTime() < 7 * 86400000).length;

  return (
    <TreinoPage title="Frequência" subtitle="Ritmo de treinos e atividades na semana.">
      <Panel>
        <strong className="text-2xl text-ink">{weekCount}</strong>
        <p className="text-sm text-slate-500">treinos concluídos nos últimos 7 dias</p>
      </Panel>
      <Panel>
        <h2 className="mb-2 font-medium text-ink">Atividades outdoor</h2>
        {activities.slice(0, 5).map(item => (
          <p key={item.id} className="text-sm text-slate-600">
            {item.sport} · {(item.distanceMeters / 1000).toFixed(2)} km
          </p>
        ))}
        {!activities.length ? <p className="text-sm text-slate-500">Nenhuma atividade ainda.</p> : null}
      </Panel>
    </TreinoPage>
  );
}
