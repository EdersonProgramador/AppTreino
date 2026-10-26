import { ChevronLeft, ChevronRight, Clock, Info, MapPin, Users } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { apiDelete, apiGet, apiPost } from "../../api";

const WEEKDAY_LABELS = ["D", "S", "T", "Q", "Q", "S", "S"] as const;

type AgendaSlotRow = {
  id: string;
  trainingType: string;
  locationName: string;
  startsAt: string;
  endsAt: string;
  capacity: number;
  bookingCount: number;
  booked: boolean;
  bookingId: string | null;
  isFull: boolean;
  coach: { id: string; name: string };
  organization: { id: string; name: string };
};

type Props = {
  token: string;
  onSuccess?: (message: string) => void;
  onError?: (message: string) => void;
};

function toDateKey(date: Date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function startOfWeek(date: Date) {
  const copy = new Date(date);
  copy.setHours(12, 0, 0, 0);
  const day = copy.getDay();
  copy.setDate(copy.getDate() - day);
  return copy;
}

function addDays(date: Date, days: number) {
  const copy = new Date(date);
  copy.setDate(copy.getDate() + days);
  return copy;
}

function formatTimeRange(startsAt: string, endsAt: string) {
  const start = new Date(startsAt);
  const end = new Date(endsAt);
  const fmt = (d: Date) =>
    d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", hour12: false });
  return `${fmt(start)} às ${fmt(end)}`;
}

function slotStatusHint(startsAt: string, endsAt: string) {
  const now = Date.now();
  const start = new Date(startsAt).getTime();
  const end = new Date(endsAt).getTime();
  if (now > end) {
    const hours = Math.max(1, Math.round((now - end) / (1000 * 60 * 60)));
    return `O agendamento encerrou há ${hours} hora(s).`;
  }
  if (now >= start && now <= end) {
    return "Treino em andamento agora.";
  }
  return "Horário aberto para reserva.";
}

export function StudentAgendaSection({ token, onSuccess, onError }: Props) {
  const [weekAnchor, setWeekAnchor] = useState(() => startOfWeek(new Date()));
  const [selectedDate, setSelectedDate] = useState(() => toDateKey(new Date()));
  const [slots, setSlots] = useState<AgendaSlotRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const onSuccessRef = useRef(onSuccess);
  const onErrorRef = useRef(onError);
  onSuccessRef.current = onSuccess;
  onErrorRef.current = onError;

  const weekDays = useMemo(
    () => WEEKDAY_LABELS.map((label, index) => {
      const date = addDays(weekAnchor, index);
      return { label, date, key: toDateKey(date) };
    }),
    [weekAnchor]
  );

  const monthTitle = useMemo(() => {
    const mid = addDays(weekAnchor, 3);
    return mid.toLocaleDateString("pt-BR", { month: "long" });
  }, [weekAnchor]);

  const fetchSlots = useCallback(
    async (opts?: { silent?: boolean }) => {
      if (!opts?.silent) setLoading(true);
      try {
        const data = await apiGet<{ slots: AgendaSlotRow[] }>(`/user/agenda/slots?date=${selectedDate}`, token);
        setSlots(data.slots);
      } catch (err) {
        onErrorRef.current?.(err instanceof Error ? err.message : "Não foi possível carregar a agenda.");
        setSlots([]);
      } finally {
        setLoading(false);
      }
    },
    [selectedDate, token]
  );

  useEffect(() => {
    void fetchSlots();
  }, [fetchSlots]);

  const book = async (slot: AgendaSlotRow) => {
    setBusyId(slot.id);
    try {
      const res = await apiPost<{
        confirmation: {
          trainingType: string;
          locationName: string;
          startsAt: string;
          endsAt: string;
          organizationName: string;
        };
      }>("/user/agenda/bookings", { slotId: slot.id }, token);
      const c = res.confirmation;
      onSuccessRef.current?.(
        `Reserva confirmada: ${c.trainingType} · ${formatTimeRange(c.startsAt, c.endsAt)} · ${c.locationName} (${c.organizationName}).`
      );
      await fetchSlots({ silent: true });
    } catch (err) {
      onErrorRef.current?.(err instanceof Error ? err.message : "Não foi possível reservar.");
    } finally {
      setBusyId(null);
    }
  };

  const cancel = async (slot: AgendaSlotRow) => {
    if (!slot.bookingId) return;
    setBusyId(slot.id);
    try {
      await apiDelete(`/user/agenda/bookings/${slot.bookingId}`, token);
      onSuccessRef.current?.("Reserva cancelada.");
      await fetchSlots({ silent: true });
    } catch (err) {
      onErrorRef.current?.(err instanceof Error ? err.message : "Não foi possível cancelar.");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <section className="student-agenda">
      <header className="student-agenda-header">
        <div className="student-agenda-header-inner">
          <strong className="student-agenda-month">{monthTitle}</strong>
          <div className="student-agenda-week-nav">
          <button
            type="button"
            className="student-agenda-week-arrow"
            aria-label="Semana anterior"
            onClick={() => setWeekAnchor((prev) => addDays(prev, -7))}
          >
            <ChevronLeft size={20} />
          </button>
          <div className="student-agenda-week-grid">
            {weekDays.map((day) => (
              <button
                key={day.key}
                type="button"
                className={`student-agenda-day${selectedDate === day.key ? " is-selected" : ""}${
                  toDateKey(new Date()) === day.key ? " is-today" : ""
                }`}
                onClick={() => setSelectedDate(day.key)}
              >
                <span className="student-agenda-day-label">{day.label}</span>
                <span className="student-agenda-day-num">{day.date.getDate()}</span>
              </button>
            ))}
          </div>
          <button
            type="button"
            className="student-agenda-week-arrow"
            aria-label="Próxima semana"
            onClick={() => setWeekAnchor((prev) => addDays(prev, 7))}
          >
            <ChevronRight size={20} />
          </button>
          </div>
        </div>
      </header>

      <div className="student-agenda-body">
        {loading ? (
          <p className="student-agenda-hint">Carregando horários…</p>
        ) : slots.length === 0 ? (
          <p className="student-agenda-hint">Nenhum horário publicado para este dia. Peça ao coach para cadastrar na agenda.</p>
        ) : (
          slots.map((slot) => {
            const past = new Date(slot.endsAt).getTime() < Date.now();
            return (
              <article className="student-agenda-card" key={slot.id}>
                <div className="student-agenda-card-top">
                  <span className="student-agenda-card-time">
                    <Clock size={16} />
                    {formatTimeRange(slot.startsAt, slot.endsAt)}
                  </span>
                  <span className="student-agenda-card-capacity">
                    <Users size={16} />
                    {slot.bookingCount}/{slot.capacity}
                  </span>
                </div>
                <h2>{slot.trainingType}</h2>
                <p className="student-agenda-card-coach">{slot.coach.name}</p>
                <p className="student-agenda-card-location">
                  <MapPin size={15} />
                  {slot.locationName}
                  <small>{slot.organization.name}</small>
                </p>
                <footer className="student-agenda-card-footer">
                  <Info size={14} />
                  <span>{slotStatusHint(slot.startsAt, slot.endsAt)}</span>
                </footer>
                {!past && (
                  <div className="student-agenda-card-actions">
                    {slot.booked ? (
                      <button type="button" className="student-agenda-btn is-muted" disabled={busyId === slot.id} onClick={() => void cancel(slot)}>
                        Cancelar reserva
                      </button>
                    ) : (
                      <button
                        type="button"
                        className={`student-agenda-btn${slot.isFull ? "" : " is-available"}`}
                        disabled={slot.isFull || busyId === slot.id}
                        onClick={() => void book(slot)}
                      >
                        {slot.isFull ? "Lotado" : "Agendar este horário"}
                      </button>
                    )}
                  </div>
                )}
              </article>
            );
          })
        )}
      </div>
    </section>
  );
}
