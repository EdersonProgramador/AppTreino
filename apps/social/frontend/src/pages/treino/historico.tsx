import { useEffect, useState } from "react";
import { api } from "@/lib";
import { TreinoPage, Panel } from "@/components/treino/TreinoPage";

export default function HistoricoPage() {
  const [logs, setLogs] = useState<any[]>([]);

  useEffect(() => {
    void api()
      .get("/fitness/history")
      .then(res => setLogs(res.data.logs || []));
  }, []);

  return (
    <TreinoPage title="Histórico" subtitle="Sessões de treino concluídas." backHref="/treino">
      {logs.map(log => (
        <Panel key={log.id}>
          <strong className="text-ink">{log.workout?.title}</strong>
          <p className="text-sm text-slate-500">
            {log.workout?.program?.title} · {new Date(log.startedAt).toLocaleString("pt-BR")}
          </p>
          <p className="mt-1 text-xs text-slate-400">
            {Math.round((log.durationSec || 0) / 60)} min · {log.status}
          </p>
        </Panel>
      ))}
      {!logs.length ? <Panel><p className="text-sm text-slate-500">Nenhum treino registrado ainda.</p></Panel> : null}
    </TreinoPage>
  );
}
