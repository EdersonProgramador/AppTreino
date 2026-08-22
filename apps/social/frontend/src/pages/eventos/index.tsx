import { useEffect, useState } from "react";
import { toast } from "react-toastify";
import { api } from "@/lib";
import { TreinoPage, Panel, PrimaryButton } from "@/components/treino/TreinoPage";

export default function EventosPage() {
  const [events, setEvents] = useState<any[]>([]);

  async function load() {
    const res = await api().get("/fitness/events");
    setEvents(res.data.events || []);
  }

  useEffect(() => {
    void load().catch(() => undefined);
  }, []);

  async function join(id: string) {
    try {
      await api().post(`/fitness/events/${id}/join`);
      toast.success("Inscrição confirmada");
      await load();
    } catch (err: any) {
      toast.error(err?.response?.data?.message || "Falha na inscrição");
    }
  }

  return (
    <TreinoPage title="Eventos" subtitle="Aulas especiais e encontros da comunidade.">
      {events.map(event => (
        <Panel key={event.id}>
          <strong className="text-ink">{event.title}</strong>
          <p className="text-sm text-slate-500">{event.description}</p>
          <p className="mt-1 text-xs text-slate-400">
            {new Date(event.startsAt).toLocaleString("pt-BR")} · {event.location} · {event.seats}/{event.capacity}
          </p>
          {event.joined ? (
            <p className="mt-2 text-sm font-medium text-brand">Você está inscrito</p>
          ) : (
            <PrimaryButton className="mt-3" onClick={() => void join(event.id)}>
              Inscrever-se
            </PrimaryButton>
          )}
        </Panel>
      ))}
    </TreinoPage>
  );
}
