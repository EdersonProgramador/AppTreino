import { useEffect, useState } from "react";
import { api } from "@/lib";
import { TreinoPage, Panel } from "@/components/treino/TreinoPage";

export default function MatriculasPage() {
  const [membership, setMembership] = useState<any>(null);

  useEffect(() => {
    void api()
      .get("/fitness/membership")
      .then(res => setMembership(res.data.membership));
  }, []);

  return (
    <TreinoPage title="Matrículas" subtitle="Seu plano no Treino Social.">
      <Panel>
        <em className="text-xs uppercase text-accent">{membership?.status || "..."}</em>
        <h2 className="text-xl font-medium text-ink">{membership?.plan || "Carregando"}</h2>
        <ul className="mt-3 space-y-1 text-sm text-slate-600">
          {(membership?.benefits || []).map((item: string) => (
            <li key={item}>• {item}</li>
          ))}
        </ul>
      </Panel>
    </TreinoPage>
  );
}
