import { FormEvent, useEffect, useState } from "react";
import { toast } from "react-toastify";
import { api } from "@/lib";
import { TreinoPage, Panel, PrimaryButton } from "@/components/treino/TreinoPage";

export default function SuportePage() {
  const [tickets, setTickets] = useState<any[]>([]);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");

  async function load() {
    const res = await api().get("/fitness/support");
    setTickets(res.data.tickets || []);
  }

  useEffect(() => {
    void load().catch(() => undefined);
  }, []);

  async function submit(event: FormEvent) {
    event.preventDefault();
    try {
      await api().post("/fitness/support", { subject, body });
      toast.success("Chamado aberto");
      setSubject("");
      setBody("");
      await load();
    } catch (err: any) {
      toast.error(err?.response?.data?.message || "Falha ao abrir chamado");
    }
  }

  return (
    <TreinoPage title="Atendimento" subtitle="Fale com o suporte do Treino Social.">
      <Panel>
        <form className="grid gap-3" onSubmit={event => void submit(event)}>
          <label className="text-sm">Assunto<input className="form-input" value={subject} onChange={e => setSubject(e.target.value)} /></label>
          <label className="text-sm">Mensagem<textarea className="form-textarea" value={body} onChange={e => setBody(e.target.value)} /></label>
          <PrimaryButton type="submit">Enviar</PrimaryButton>
        </form>
      </Panel>
      {tickets.map(ticket => (
        <Panel key={ticket.id}>
          <strong className="text-ink">{ticket.subject}</strong>
          <p className="text-sm text-slate-500">{ticket.body}</p>
          <p className="mt-1 text-xs text-slate-400">{ticket.status} · {new Date(ticket.createdAt).toLocaleString("pt-BR")}</p>
        </Panel>
      ))}
    </TreinoPage>
  );
}
