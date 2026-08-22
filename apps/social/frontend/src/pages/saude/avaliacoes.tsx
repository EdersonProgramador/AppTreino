import { FormEvent, useEffect, useState } from "react";
import { toast } from "react-toastify";
import { api } from "@/lib";
import { TreinoPage, Panel, PrimaryButton } from "@/components/treino/TreinoPage";

export default function AvaliacoesPage() {
  const [rows, setRows] = useState<any[]>([]);
  const [weightKg, setWeightKg] = useState("");
  const [heightCm, setHeightCm] = useState("");
  const [bodyFatPct, setBodyFatPct] = useState("");

  async function load() {
    const res = await api().get("/fitness/assessments");
    setRows(res.data.assessments || []);
  }

  useEffect(() => {
    void load().catch(() => undefined);
  }, []);

  async function submit(event: FormEvent) {
    event.preventDefault();
    try {
      await api().post("/fitness/assessments", {
        weightKg: weightKg ? Number(weightKg) : undefined,
        heightCm: heightCm ? Number(heightCm) : undefined,
        bodyFatPct: bodyFatPct ? Number(bodyFatPct) : undefined
      });
      toast.success("Avaliação salva");
      setWeightKg("");
      setHeightCm("");
      setBodyFatPct("");
      await load();
    } catch (err: any) {
      toast.error(err?.response?.data?.message || "Falha ao salvar");
    }
  }

  return (
    <TreinoPage title="Avaliação física" subtitle="Acompanhe peso, altura e composição.">
      <Panel>
        <form className="grid gap-3" onSubmit={event => void submit(event)}>
          <label className="text-sm">Peso (kg)<input className="form-input" value={weightKg} onChange={e => setWeightKg(e.target.value)} /></label>
          <label className="text-sm">Altura (cm)<input className="form-input" value={heightCm} onChange={e => setHeightCm(e.target.value)} /></label>
          <label className="text-sm">% gordura<input className="form-input" value={bodyFatPct} onChange={e => setBodyFatPct(e.target.value)} /></label>
          <PrimaryButton type="submit">Salvar avaliação</PrimaryButton>
        </form>
      </Panel>
      {rows.map(row => (
        <Panel key={row.id}>
          <p className="text-sm text-ink">
            {row.weightKg ? `${row.weightKg} kg` : "—"} · {row.heightCm ? `${row.heightCm} cm` : "—"} ·{" "}
            {row.bodyFatPct != null ? `${row.bodyFatPct}%` : "—"}
          </p>
          <p className="text-xs text-slate-400">{new Date(row.createdAt).toLocaleString("pt-BR")}</p>
        </Panel>
      ))}
    </TreinoPage>
  );
}
