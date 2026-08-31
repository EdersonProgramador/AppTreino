import { useCallback, useEffect, useState } from "react";
import { Loader2, Plus, Trash2, Upload } from "lucide-react";
import { apiDelete, apiGet, apiPost } from "../../api";
import { dataRowClass } from "../../lib/admin-cms-classes";

type OrgUser = { id: string; name: string; email: string | null };
type Unit = { id: string; name: string };

type WorkoutBlock = {
  id: string;
  title: string;
  modalityId: string | null;
  modality: { id: string; name: string } | null;
};

type OrgProgram = {
  id: string;
  title: string;
  status: string;
  sourceType: "ORGANIZATION" | "COACH";
  targetGender: string;
  modality: { id: string; name: string } | null;
  unit: { id: string; name: string } | null;
  days: Array<{ id: string; dayNumber: number; workoutBlockId: string }>;
  assignedUsers: Array<{ id: string; userId: string }>;
};

type PlatformModality = { id: string; name: string; isActive: boolean };

type Props = {
  token: string;
  organizationId: string;
  units: Unit[];
  busy: boolean;
  onBusy: (action: () => Promise<void>, success: string) => Promise<void>;
  onError: (message: string) => void;
};

export function OrgProgramsPanel({ token, organizationId, units, busy, onBusy, onError }: Props) {
  const [programs, setPrograms] = useState<OrgProgram[]>([]);
  const [blocks, setBlocks] = useState<WorkoutBlock[]>([]);
  const [modalities, setModalities] = useState<PlatformModality[]>([]);
  const [loading, setLoading] = useState(false);

  const [title, setTitle] = useState("");
  const [sourceType, setSourceType] = useState<"ORGANIZATION" | "COACH">("ORGANIZATION");
  const [modalityId, setModalityId] = useState("");
  const [unitId, setUnitId] = useState("");
  const [targetGender, setTargetGender] = useState<"ALL" | "MALE" | "FEMALE">("ALL");
  const [selectedBlockId, setSelectedBlockId] = useState("");
  const [dayNumber, setDayNumber] = useState(1);
  const [days, setDays] = useState<Array<{ workoutBlockId: string; dayNumber: number; order: number; label: string }>>([]);

  const [assignProgramId, setAssignProgramId] = useState("");
  const [assignQuery, setAssignQuery] = useState("");
  const [assignResults, setAssignResults] = useState<OrgUser[]>([]);
  const [assignAthleteId, setAssignAthleteId] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [programsData, blocksData, modalitiesData] = await Promise.all([
        apiGet<{ programs: OrgProgram[] }>(`/org/organizations/${organizationId}/programs`, token),
        apiGet<{ blocks: WorkoutBlock[] }>("/org/workout-blocks", token),
        apiGet<{ modalities: PlatformModality[] }>("/admin/cms/modalities", token)
      ]);
      setPrograms(programsData.programs);
      setBlocks(blocksData.blocks);
      setModalities(modalitiesData.modalities.filter((item) => item.isActive));
      if (!modalityId && modalitiesData.modalities[0]) setModalityId(modalitiesData.modalities[0].id);
      if (!unitId && units[0]) setUnitId(units[0].id);
    } catch (err) {
      onError(err instanceof Error ? err.message : "Falha ao carregar programas.");
    } finally {
      setLoading(false);
    }
  }, [modalityId, onError, organizationId, token, unitId, units]);

  useEffect(() => {
    void load();
  }, [load]);

  const addDay = () => {
    const block = blocks.find((item) => item.id === selectedBlockId);
    if (!block) return;
    setDays((current) => [
      ...current,
      {
        workoutBlockId: block.id,
        dayNumber,
        order: 1,
        label: `Dia ${dayNumber}: ${block.title}`
      }
    ]);
    setDayNumber((value) => value + 1);
  };

  const createProgram = () =>
    onBusy(async () => {
      await apiPost(
        "/org/programs",
        {
          organizationId,
          unitId: unitId || undefined,
          modalityId,
          title: title.trim(),
          sourceType,
          targetGender,
          days: days.map(({ workoutBlockId, dayNumber: day, order }) => ({
            workoutBlockId,
            dayNumber: day,
            order
          }))
        },
        token
      );
      setTitle("");
      setDays([]);
      setDayNumber(1);
      await load();
    }, "Programa organizacional criado (rascunho).");

  const publish = (programId: string) =>
    onBusy(async () => {
      await apiPost(`/org/programs/${programId}/publish`, {}, token);
      await load();
    }, "Programa publicado — alunos vinculados à org passam a vê-lo.");

  const archive = (programId: string) =>
    onBusy(async () => {
      await apiPost(`/org/programs/${programId}/archive`, {}, token);
      await load();
    }, "Programa arquivado.");

  const remove = (programId: string) =>
    onBusy(async () => {
      await apiDelete(`/org/programs/${programId}`, token);
      await load();
    }, "Programa removido.");

  const searchAthletes = async () => {
    if (assignQuery.trim().length < 2) return;
    try {
      const data = await apiGet<{ users: OrgUser[] }>(
        `/org/users?q=${encodeURIComponent(assignQuery.trim())}`,
        token
      );
      setAssignResults(data.users);
    } catch (err) {
      onError(err instanceof Error ? err.message : "Busca falhou.");
    }
  };

  const assign = () =>
    onBusy(async () => {
      await apiPost(`/org/programs/${assignProgramId}/assign`, { athleteIds: [assignAthleteId] }, token);
      setAssignAthleteId("");
      setAssignQuery("");
      setAssignResults([]);
      await load();
    }, "Programa atribuído ao aluno.");

  const filteredBlocks = modalityId
    ? blocks.filter((block) => !block.modalityId || block.modalityId === modalityId)
    : blocks;

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <article className="rounded-3xl border border-[color:var(--app-border)] bg-[var(--app-panel)] p-5">
        <h2 className="mb-4 flex items-center gap-2 text-lg font-bold text-sand">
          <Plus size={18} /> Novo programa da organização
        </h2>
        <p className="mb-4 text-sm text-sand-muted">
          Usa fichas já cadastradas no CMS da plataforma. Após publicar, alunos vinculados à org/unidade recebem o programa.
        </p>
        <div className="grid gap-3">
          <input
            className="admin-input"
            placeholder="Título do programa"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
          <select className="admin-input" value={sourceType} onChange={(e) => setSourceType(e.target.value as "ORGANIZATION" | "COACH")}>
            <option value="ORGANIZATION">Organização</option>
            <option value="COACH">Coach</option>
          </select>
          <select className="admin-input" value={modalityId} onChange={(e) => setModalityId(e.target.value)}>
            {modalities.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
          <select className="admin-input" value={unitId} onChange={(e) => setUnitId(e.target.value)}>
            <option value="">Todas as unidades (org inteira)</option>
            {units.map((unit) => (
              <option key={unit.id} value={unit.id}>
                {unit.name}
              </option>
            ))}
          </select>
          <select
            className="admin-input"
            value={targetGender}
            onChange={(e) => setTargetGender(e.target.value as "ALL" | "MALE" | "FEMALE")}
          >
            <option value="ALL">Todos os sexos</option>
            <option value="MALE">Masculino</option>
            <option value="FEMALE">Feminino</option>
          </select>

          <div className="grid gap-2 rounded-2xl border border-[color:var(--app-border)] p-3">
            <span className="text-xs font-semibold uppercase tracking-wide text-sand-muted">Dias / fichas</span>
            <select className="admin-input" value={selectedBlockId} onChange={(e) => setSelectedBlockId(e.target.value)}>
              <option value="">Selecione a ficha (bloco)</option>
              {filteredBlocks.map((block) => (
                <option key={block.id} value={block.id}>
                  {block.title}
                  {block.modality ? ` · ${block.modality.name}` : ""}
                </option>
              ))}
            </select>
            <div className="flex gap-2">
              <input
                className="admin-input w-24"
                type="number"
                min={1}
                value={dayNumber}
                onChange={(e) => setDayNumber(Number(e.target.value) || 1)}
              />
              <button type="button" className="admin-secondary-button" disabled={!selectedBlockId} onClick={addDay}>
                Adicionar dia
              </button>
            </div>
            {days.length > 0 && (
              <ul className="grid gap-1 text-sm text-sand-muted">
                {days.map((day, index) => (
                  <li key={`${day.workoutBlockId}-${day.dayNumber}-${index}`} className="flex items-center justify-between gap-2">
                    <span>{day.label}</span>
                    <button type="button" className="text-red-400" onClick={() => setDays((current) => current.filter((_, i) => i !== index))}>
                      <Trash2 size={14} />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <button
            type="button"
            className="admin-primary-button"
            disabled={busy || title.trim().length < 2 || !modalityId || days.length === 0}
            onClick={() => void createProgram()}
          >
            Criar rascunho
          </button>
        </div>
      </article>

      <article className="rounded-3xl border border-[color:var(--app-border)] bg-[var(--app-panel)] p-5">
        <h2 className="mb-4 text-lg font-bold text-sand">Programas da organização</h2>
        {loading ? (
          <p className="flex items-center gap-2 text-sm text-sand-muted">
            <Loader2 size={16} className="animate-spin" /> Carregando...
          </p>
        ) : programs.length === 0 ? (
          <p className="text-sm text-sand-muted">Nenhum programa organizacional ainda.</p>
        ) : (
          <ul className="grid gap-2 text-sm">
            {programs.map((program) => (
              <li key={program.id} className={dataRowClass}>
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <strong>{program.title}</strong>
                    <span className="block text-xs text-sand-muted">
                      {program.sourceType} · {program.status} · {program.modality?.name ?? "—"} ·{" "}
                      {program.days.length} dia(s) · {program.assignedUsers.length} atribuição(ões)
                      {program.unit ? ` · ${program.unit.name}` : ""}
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {program.status !== "PUBLISHED" && (
                      <button type="button" className="admin-secondary-button" disabled={busy} onClick={() => void publish(program.id)}>
                        <Upload size={14} /> Publicar
                      </button>
                    )}
                    {program.status === "PUBLISHED" && (
                      <button type="button" className="admin-secondary-button" disabled={busy} onClick={() => void archive(program.id)}>
                        Arquivar
                      </button>
                    )}
                    <button type="button" className="admin-secondary-button text-red-400" disabled={busy} onClick={() => void remove(program.id)}>
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}

        <h3 className="mb-2 mt-6 text-sm font-bold text-sand">Atribuir a aluno específico</h3>
        <p className="mb-3 text-xs text-sand-muted">
          Opcional: além do vínculo à org, força UserProgram ASSIGNED para o aluno.
        </p>
        <div className="grid gap-3">
          <select className="admin-input" value={assignProgramId} onChange={(e) => setAssignProgramId(e.target.value)}>
            <option value="">Programa</option>
            {programs
              .filter((item) => item.status === "PUBLISHED")
              .map((item) => (
                <option key={item.id} value={item.id}>
                  {item.title}
                </option>
              ))}
          </select>
          <div className="flex gap-2">
            <input
              className="admin-input flex-1"
              placeholder="Buscar aluno"
              value={assignQuery}
              onChange={(e) => setAssignQuery(e.target.value)}
            />
            <button type="button" className="admin-secondary-button" onClick={() => void searchAthletes()}>
              Buscar
            </button>
          </div>
          {assignResults.length > 0 && (
            <select className="admin-input" value={assignAthleteId} onChange={(e) => setAssignAthleteId(e.target.value)}>
              <option value="">Selecione</option>
              {assignResults.map((user) => (
                <option key={user.id} value={user.id}>
                  {user.name} {user.email ? `(${user.email})` : ""}
                </option>
              ))}
            </select>
          )}
          <button
            type="button"
            className="admin-primary-button"
            disabled={busy || !assignProgramId || !assignAthleteId}
            onClick={() => void assign()}
          >
            Atribuir programa
          </button>
        </div>
      </article>
    </div>
  );
}
