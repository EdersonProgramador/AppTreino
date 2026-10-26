import { CalendarPlus, Loader2, Trash2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { apiDelete, apiGet, apiPost } from "../../api";

type Unit = { id: string; name: string };
type OrgUser = { id: string; name: string };
type Organization = { id: string; name: string; units: Unit[] };

type AgendaSlotAdmin = {
  id: string;
  trainingType: string;
  locationName: string;
  startsAt: string;
  endsAt: string;
  capacity: number;
  coach: OrgUser;
  bookings: Array<{ user: OrgUser }>;
};

type Props = {
  token: string;
  organization: Organization | null;
  coachUserId: string;
  busy: boolean;
  onBusy: (value: boolean) => void;
  onFeedback: (message: string) => void;
  onError: (message: string) => void;
};

function toDateKey(date: Date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function CoachAgendaPanel({ token, organization, coachUserId, busy, onBusy, onFeedback, onError }: Props) {
  const [date, setDate] = useState(() => toDateKey(new Date()));
  const [slots, setSlots] = useState<AgendaSlotAdmin[]>([]);
  const [loading, setLoading] = useState(false);
  const [trainingType, setTrainingType] = useState("");
  const [locationName, setLocationName] = useState("");
  const [unitId, setUnitId] = useState("");
  const [startsAt, setStartsAt] = useState("");
  const [endsAt, setEndsAt] = useState("");
  const [capacity, setCapacity] = useState(15);

  const units = organization?.units ?? [];

  useEffect(() => {
    if (units[0] && !unitId) setUnitId(units[0].id);
    if (organization && !locationName) setLocationName(organization.name);
  }, [locationName, organization, unitId, units]);

  const load = useCallback(async () => {
    if (!organization) return;
    setLoading(true);
    try {
      const data = await apiGet<{ slots: AgendaSlotAdmin[] }>(
        `/org/organizations/${organization.id}/agenda/slots?date=${date}`,
        token
      );
      setSlots(data.slots);
    } catch (err) {
      onError(err instanceof Error ? err.message : "Falha ao carregar agenda.");
      setSlots([]);
    } finally {
      setLoading(false);
    }
  }, [date, onError, organization, token]);

  useEffect(() => {
    void load();
  }, [load]);

  const selectedUnitName = useMemo(() => units.find((u) => u.id === unitId)?.name ?? "", [unitId, units]);

  const createSlot = async () => {
    if (!organization) return;
    if (!trainingType.trim() || !locationName.trim() || !startsAt || !endsAt) {
      onError("Preencha modalidade, local, início e fim.");
      return;
    }
    onBusy(true);
    try {
      await apiPost(
        "/org/agenda/slots",
        {
          organizationId: organization.id,
          unitId: unitId || undefined,
          coachId: coachUserId,
          trainingType: trainingType.trim(),
          locationName: locationName.trim(),
          startsAt: new Date(startsAt).toISOString(),
          endsAt: new Date(endsAt).toISOString(),
          capacity
        },
        token
      );
      onFeedback("Horário publicado na agenda dos alunos.");
      setTrainingType("");
      setStartsAt("");
      setEndsAt("");
      await load();
    } catch (err) {
      onError(err instanceof Error ? err.message : "Não foi possível cadastrar.");
    } finally {
      onBusy(false);
    }
  };

  const removeSlot = async (slotId: string) => {
    onBusy(true);
    try {
      await apiDelete(`/org/agenda/slots/${slotId}`, token);
      onFeedback("Horário removido.");
      await load();
    } catch (err) {
      onError(err instanceof Error ? err.message : "Não foi possível remover.");
    } finally {
      onBusy(false);
    }
  };

  if (!organization) {
    return <p className="coach-empty">Selecione uma organização para cadastrar horários.</p>;
  }

  return (
    <section className="coach-layout-2">
      <article className="coach-section">
        <div className="coach-section__head">
          <h2 className="coach-section__title">
            <CalendarPlus size={20} />
            Cadastro de horários
          </h2>
          <p className="coach-section__subtitle">
            Alunos veem estes horários na Agenda da Timeline e confirmam a modalidade desejada.
          </p>
        </div>
        <div className="coach-form-stack coach-form-stack--2">
          <label>
            Tipo de treino / modalidade
            <input className="admin-input" value={trainingType} onChange={(e) => setTrainingType(e.target.value)} placeholder="Ex.: Musculação, Cross, Funcional" />
          </label>
          <label>
            Unidade
            <select className="admin-input" value={unitId} onChange={(e) => setUnitId(e.target.value)}>
              {units.map((unit) => (
                <option key={unit.id} value={unit.id}>
                  {unit.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Local do treino
            <input className="admin-input" value={locationName} onChange={(e) => setLocationName(e.target.value)} placeholder="Nome da academia / box / sala" />
          </label>
          <label>
            Início
            <input className="admin-input" type="datetime-local" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} />
          </label>
          <label>
            Fim
            <input className="admin-input" type="datetime-local" value={endsAt} onChange={(e) => setEndsAt(e.target.value)} />
          </label>
          <label>
            Capacidade
            <input className="admin-input" type="number" min={1} max={500} value={capacity} onChange={(e) => setCapacity(Number(e.target.value) || 1)} />
          </label>
        </div>
        {selectedUnitName ? (
          <p className="mt-3 text-xs text-sand-muted">Unidade selecionada: {selectedUnitName}</p>
        ) : null}
        <button type="button" className="admin-primary-button mt-4" disabled={busy} onClick={() => void createSlot()}>
          {busy ? <Loader2 className="animate-spin" size={16} /> : null}
          Publicar horário
        </button>
      </article>

      <article className="coach-section">
        <div className="coach-section__head flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="coach-section__title">Horários do dia</h2>
            <p className="coach-section__subtitle">Reservas e capacidade por horário.</p>
          </div>
          <label className="coach-org-picker">
            Data
            <input className="admin-input" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </label>
        </div>
        {loading ? (
          <p className="coach-empty">Carregando…</p>
        ) : slots.length === 0 ? (
          <p className="coach-empty">Nenhum horário nesta data.</p>
        ) : (
          <ul className="coach-list">
            {slots.map((slot) => (
              <li key={slot.id} className="coach-slot-row">
                <div>
                  <strong>{slot.trainingType}</strong>
                  <span className="block text-xs text-sand-muted">
                    {new Date(slot.startsAt).toLocaleString("pt-BR")} — {slot.locationName} · {slot.bookings.length}/{slot.capacity} alunos
                  </span>
                </div>
                <button type="button" className="admin-secondary-button" disabled={busy} onClick={() => void removeSlot(slot.id)}>
                  <Trash2 size={16} />
                  Remover
                </button>
              </li>
            ))}
          </ul>
        )}
      </article>
    </section>
  );
}
