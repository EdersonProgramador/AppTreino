import { useEffect, useState } from "react";
import { api } from "@/lib";
import { TreinoPage, Panel } from "@/components/treino/TreinoPage";

export default function UnidadesPage() {
  const [locations, setLocations] = useState<any[]>([]);

  useEffect(() => {
    void api()
      .get("/fitness/locations")
      .then(res => setLocations(res.data.locations || []));
  }, []);

  return (
    <TreinoPage title="Unidades" subtitle="Academias e endereços parceiros.">
      {locations.map(item => (
        <Panel key={item.id}>
          <strong className="text-ink">{item.name}</strong>
          <p className="text-sm text-slate-500">
            {item.address} · {item.city}
          </p>
          {item.phone ? <p className="mt-1 text-sm text-brand">{item.phone}</p> : null}
        </Panel>
      ))}
    </TreinoPage>
  );
}
