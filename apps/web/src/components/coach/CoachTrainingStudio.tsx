import { useCallback, useEffect, useMemo, useState } from "react";
import { Dumbbell, Layers, Loader2, Plus, Send, Trash2, Upload } from "lucide-react";
import { trainingCopy } from "../../lib/training-copy";
import { apiDelete, apiGet, apiPost, apiPut } from "../../api";

type Unit = { id: string; name: string };
type OrgUser = { id: string; name: string; email: string | null };

type Modality = { id: string; name: string; isActive: boolean };

type Exercise = {
  id: string;
  title: string | null;
  videoUrl: string | null;
  notes: string | null;
  sourceType: string;
  modalityLinks: Array<{ modality: { id: string; name: string } }>;
};

type WorkoutBlock = {
  id: string;
  title: string;
  sourceType: string;
  structureType: string;
  restTime: number;
  modality: { id: string; name: string } | null;
  exercises: Array<{
    id: string;
    sets: number;
    repsRange: string;
    exercise: { id: string; title: string | null };
  }>;
};

type OrgProgram = {
  id: string;
  title: string;
  status: string;
  sourceType: string;
  targetGender: string;
  modality: { id: string; name: string } | null;
  unit: { id: string; name: string } | null;
  days: Array<{ id: string; dayNumber: number; workoutBlockId: string }>;
  assignedUsers: Array<{ id: string; userId: string }>;
};

type StudioStep = "exercises" | "blocks" | "programs" | "distribute";

type Props = {
  token: string;
  organizationId: string;
  units: Unit[];
  assignedAthletes: OrgUser[];
  busy: boolean;
  onBusy: (action: () => Promise<void>, success: string) => Promise<void>;
  onError: (message: string) => void;
};

const STEPS: Array<{ id: StudioStep; label: string; icon: typeof Dumbbell }> = [
  { id: "exercises", label: trainingCopy.exercises, icon: Dumbbell },
  { id: "blocks", label: trainingCopy.divisions, icon: Layers },
  { id: "programs", label: "Programas", icon: Upload },
  { id: "distribute", label: "Distribuir", icon: Send }
];

export function CoachTrainingStudio({
  token,
  organizationId,
  units,
  assignedAthletes,
  busy,
  onBusy,
  onError
}: Props) {
  const [step, setStep] = useState<StudioStep>("exercises");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [modalities, setModalities] = useState<Modality[]>([]);
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [blocks, setBlocks] = useState<WorkoutBlock[]>([]);
  const [programs, setPrograms] = useState<OrgProgram[]>([]);

  const [exerciseTitle, setExerciseTitle] = useState("");
  const [exerciseModalityId, setExerciseModalityId] = useState("");
  const [exerciseVideoUrl, setExerciseVideoUrl] = useState("");
  const [exerciseNotes, setExerciseNotes] = useState("");

  const [blockTitle, setBlockTitle] = useState("");
  const [blockModalityId, setBlockModalityId] = useState("");
  const [blockRestTime, setBlockRestTime] = useState(60);
  const [blockExerciseId, setBlockExerciseId] = useState("");
  const [blockSets, setBlockSets] = useState(3);
  const [blockReps, setBlockReps] = useState("8-12");
  const [blockLineup, setBlockLineup] = useState<
    Array<{ exerciseId: string; title: string; sets: number; repsRange: string; order: number }>
  >([]);

  const [programTitle, setProgramTitle] = useState("");
  const [programModalityId, setProgramModalityId] = useState("");
  const [programUnitId, setProgramUnitId] = useState("");
  const [programBlockId, setProgramBlockId] = useState("");
  const [programDayNumber, setProgramDayNumber] = useState(1);
  const [programDays, setProgramDays] = useState<
    Array<{ workoutBlockId: string; dayNumber: number; order: number; label: string }>
  >([]);

  const [assignProgramId, setAssignProgramId] = useState("");
  const [assignAthleteId, setAssignAthleteId] = useState("");

  const ownExercises = useMemo(
    () => exercises.filter((item) => item.sourceType === "COACH"),
    [exercises]
  );
  const ownBlocks = useMemo(
    () => blocks.filter((item) => item.sourceType === "COACH"),
    [blocks]
  );
  const publishedPrograms = useMemo(
    () => programs.filter((item) => item.status === "PUBLISHED"),
    [programs]
  );

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const [modalitiesData, exercisesData, blocksData, programsData] = await Promise.all([
        apiGet<{ modalities: Modality[] }>("/org/modalities", token),
        apiGet<{ exercises: Exercise[] }>(`/org/organizations/${organizationId}/training/exercises`, token),
        apiGet<{ blocks: WorkoutBlock[] }>(
          `/org/organizations/${organizationId}/training/workout-blocks`,
          token
        ),
        apiGet<{ programs: OrgProgram[] }>(`/org/organizations/${organizationId}/programs`, token)
      ]);
      setModalities(modalitiesData.modalities);
      setExercises(exercisesData.exercises);
      setBlocks(blocksData.blocks);
      setPrograms(programsData.programs);
      setExerciseModalityId((current) => current || modalitiesData.modalities[0]?.id || "");
      setBlockModalityId((current) => current || modalitiesData.modalities[0]?.id || "");
      setProgramModalityId((current) => current || modalitiesData.modalities[0]?.id || "");
      setProgramUnitId((current) => current || units[0]?.id || "");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Falha ao carregar estúdio.";
      setLoadError(message);
      onError(message);
    } finally {
      setLoading(false);
    }
  }, [onError, organizationId, token, units]);

  useEffect(() => {
    void load();
  }, [load]);

  const filteredProgramBlocks = programModalityId
    ? blocks.filter((block) => !block.modality?.id || block.modality.id === programModalityId)
    : blocks;

  const addBlockExercise = () => {
    const exercise = exercises.find((item) => item.id === blockExerciseId);
    if (!exercise) return;
    setBlockLineup((current) => [
      ...current,
      {
        exerciseId: exercise.id,
        title: exercise.title ?? "Exercício",
        sets: blockSets,
        repsRange: blockReps,
        order: current.length + 1
      }
    ]);
    setBlockExerciseId("");
  };

  const addProgramDay = () => {
    const block = blocks.find((item) => item.id === programBlockId);
    if (!block) return;
    setProgramDays((current) => [
      ...current,
      {
        workoutBlockId: block.id,
        dayNumber: programDayNumber,
        order: 1,
        label: `Dia ${programDayNumber}: ${block.title}`
      }
    ]);
    setProgramDayNumber((value) => value + 1);
  };

  if (loading) {
    return (
      <p className="flex items-center gap-2 text-sm text-sand-muted">
        <Loader2 size={16} className="animate-spin" /> Carregando estúdio...
      </p>
    );
  }

  if (loadError) {
    return (
      <article className="rounded-3xl border border-[color:var(--app-border)] bg-[var(--app-panel)] p-5 text-sm text-red-400">
        {loadError}
      </article>
    );
  }

  return (
    <section className="grid gap-6">
      <header className="rounded-3xl border border-[color:var(--app-border)] bg-[var(--app-panel)] p-5">
        <h2 className="mb-1 text-lg font-bold text-sand">{trainingCopy.adminStudioTitle}</h2>
        <p className="m-0 text-sm text-sand-muted">
          Produza exercícios, monte divisões, publique programas e distribua para sua base de alunos.
        </p>
      </header>

      <nav className="finance-hub-tabs" aria-label="Etapas do estúdio">
        {STEPS.map((item) => (
          <button
            key={item.id}
            type="button"
            className={step === item.id ? "active" : ""}
            onClick={() => setStep(item.id)}
          >
            <item.icon size={16} />
            {item.label}
          </button>
        ))}
      </nav>

      {step === "exercises" && (
        <div className="grid gap-6 lg:grid-cols-2">
          <article className="rounded-3xl border border-[color:var(--app-border)] bg-[var(--app-panel)] p-5">
            <h3 className="mb-4 flex items-center gap-2 text-base font-bold">
              <Plus size={16} /> Novo {trainingCopy.exercise.toLowerCase()}
            </h3>
            <div className="grid gap-3">
              <input
                className="admin-input"
                placeholder="Nome do exercício"
                value={exerciseTitle}
                onChange={(e) => setExerciseTitle(e.target.value)}
              />
              <select
                className="admin-input"
                value={exerciseModalityId}
                onChange={(e) => setExerciseModalityId(e.target.value)}
              >
                {modalities.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
              <input
                className="admin-input"
                placeholder="URL do vídeo (opcional)"
                value={exerciseVideoUrl}
                onChange={(e) => setExerciseVideoUrl(e.target.value)}
              />
              <textarea
                className="admin-input min-h-[80px]"
                placeholder="Observações de execução (opcional)"
                value={exerciseNotes}
                onChange={(e) => setExerciseNotes(e.target.value)}
              />
              <button
                type="button"
                className="admin-primary-button"
                disabled={busy || exerciseTitle.trim().length < 2 || !exerciseModalityId}
                onClick={() =>
                  void onBusy(async () => {
                    await apiPost(
                      "/org/training/exercises",
                      {
                        organizationId,
                        title: exerciseTitle.trim(),
                        modalityIds: [exerciseModalityId],
                        videoUrl: exerciseVideoUrl.trim(),
                        notes: exerciseNotes.trim()
                      },
                      token
                    );
                    setExerciseTitle("");
                    setExerciseVideoUrl("");
                    setExerciseNotes("");
                    await load();
                  }, "Exercício criado.")
                }
              >
                Salvar exercício
              </button>
            </div>
          </article>

          <article className="rounded-3xl border border-[color:var(--app-border)] bg-[var(--app-panel)] p-5">
            <h3 className="mb-4 text-base font-bold">Meus exercícios ({ownExercises.length})</h3>
            {ownExercises.length === 0 ? (
              <p className="text-sm text-sand-muted">Nenhum exercício próprio ainda.</p>
            ) : (
              <ul className="grid max-h-[420px] gap-2 overflow-y-auto text-sm">
                {ownExercises.map((item) => (
                  <li
                    key={item.id}
                    className="flex items-start justify-between gap-2 rounded-2xl border border-[color:var(--app-border)] px-4 py-3"
                  >
                    <div>
                      <strong>{item.title}</strong>
                      <span className="block text-xs text-sand-muted">
                        {item.modalityLinks.map((link) => link.modality.name).join(" · ")}
                      </span>
                    </div>
                    <button
                      type="button"
                      className="text-red-400"
                      disabled={busy}
                      onClick={() =>
                        void onBusy(async () => {
                          await apiDelete(
                            `/org/training/exercises/${item.id}?organizationId=${encodeURIComponent(organizationId)}`,
                            token
                          );
                          await load();
                        }, "Exercício removido.")
                      }
                    >
                      <Trash2 size={14} />
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <p className="mt-4 text-xs text-sand-muted">
              Também disponível: {exercises.length - ownExercises.length} exercício(s) da plataforma para montar
              divisões.
            </p>
          </article>
        </div>
      )}

      {step === "blocks" && (
        <div className="grid gap-6 lg:grid-cols-2">
          <article className="rounded-3xl border border-[color:var(--app-border)] bg-[var(--app-panel)] p-5">
            <h3 className="mb-4 flex items-center gap-2 text-base font-bold">
              <Plus size={16} /> Nova {trainingCopy.division.toLowerCase()}
            </h3>
            <div className="grid gap-3">
              <input
                className="admin-input"
                placeholder="Título da divisão"
                value={blockTitle}
                onChange={(e) => setBlockTitle(e.target.value)}
              />
              <select
                className="admin-input"
                value={blockModalityId}
                onChange={(e) => setBlockModalityId(e.target.value)}
              >
                {modalities.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
              <input
                className="admin-input"
                type="number"
                min={0}
                value={blockRestTime}
                onChange={(e) => setBlockRestTime(Number(e.target.value) || 0)}
                placeholder="Descanso padrão (seg)"
              />
              <div className="grid gap-2 rounded-2xl border border-[color:var(--app-border)] p-3">
                <span className="text-xs font-semibold uppercase tracking-wide text-sand-muted">Exercícios</span>
                <select
                  className="admin-input"
                  value={blockExerciseId}
                  onChange={(e) => setBlockExerciseId(e.target.value)}
                >
                  <option value="">Selecione exercício</option>
                  {exercises
                    .filter((item) => !blockModalityId || item.modalityLinks.some((link) => link.modality.id === blockModalityId))
                    .map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.title} {item.sourceType === "COACH" ? "· meu" : "· plataforma"}
                      </option>
                    ))}
                </select>
                <div className="flex gap-2">
                  <input
                    className="admin-input w-20"
                    type="number"
                    min={1}
                    value={blockSets}
                    onChange={(e) => setBlockSets(Number(e.target.value) || 1)}
                  />
                  <input
                    className="admin-input flex-1"
                    value={blockReps}
                    onChange={(e) => setBlockReps(e.target.value)}
                    placeholder="Reps (ex: 8-12)"
                  />
                  <button
                    type="button"
                    className="admin-secondary-button"
                    disabled={!blockExerciseId}
                    onClick={addBlockExercise}
                  >
                    Adicionar
                  </button>
                </div>
                {blockLineup.length > 0 && (
                  <ul className="grid gap-1 text-sm text-sand-muted">
                    {blockLineup.map((item, index) => (
                      <li key={`${item.exerciseId}-${index}`} className="flex justify-between gap-2">
                        <span>
                          {item.order}. {item.title} · {item.sets}x {item.repsRange}
                        </span>
                        <button
                          type="button"
                          className="text-red-400"
                          onClick={() => setBlockLineup((current) => current.filter((_, i) => i !== index))}
                        >
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
                disabled={busy || blockTitle.trim().length < 2 || !blockModalityId || blockLineup.length === 0}
                onClick={() =>
                  void onBusy(async () => {
                    await apiPost(
                      "/org/training/workout-blocks",
                      {
                        organizationId,
                        title: blockTitle.trim(),
                        modalityId: blockModalityId,
                        restTime: blockRestTime,
                        exercises: blockLineup.map((item) => ({
                          exerciseId: item.exerciseId,
                          sets: item.sets,
                          repsRange: item.repsRange,
                          order: item.order
                        }))
                      },
                      token
                    );
                    setBlockTitle("");
                    setBlockLineup([]);
                    await load();
                  }, "Divisão criada.")
                }
              >
                Salvar divisão
              </button>
            </div>
          </article>

          <article className="rounded-3xl border border-[color:var(--app-border)] bg-[var(--app-panel)] p-5">
            <h3 className="mb-4 text-base font-bold">Minhas divisões ({ownBlocks.length})</h3>
            {ownBlocks.length === 0 ? (
              <p className="text-sm text-sand-muted">Nenhuma divisão própria ainda.</p>
            ) : (
              <ul className="grid max-h-[420px] gap-2 overflow-y-auto text-sm">
                {ownBlocks.map((item) => (
                  <li
                    key={item.id}
                    className="rounded-2xl border border-[color:var(--app-border)] px-4 py-3"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <strong>{item.title}</strong>
                        <span className="block text-xs text-sand-muted">
                          {item.modality?.name ?? "—"} · {item.exercises.length} exercício(s)
                        </span>
                      </div>
                      <button
                        type="button"
                        className="text-red-400"
                        disabled={busy}
                        onClick={() =>
                          void onBusy(async () => {
                            await apiDelete(
                              `/org/training/workout-blocks/${item.id}?organizationId=${encodeURIComponent(organizationId)}`,
                              token
                            );
                            await load();
                          }, "Divisão removida.")
                        }
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </article>
        </div>
      )}

      {step === "programs" && (
        <div className="grid gap-6 lg:grid-cols-2">
          <article className="rounded-3xl border border-[color:var(--app-border)] bg-[var(--app-panel)] p-5">
            <h3 className="mb-4 flex items-center gap-2 text-base font-bold">
              <Plus size={16} /> Novo programa
            </h3>
            <div className="grid gap-3">
              <input
                className="admin-input"
                placeholder="Título do programa"
                value={programTitle}
                onChange={(e) => setProgramTitle(e.target.value)}
              />
              <select
                className="admin-input"
                value={programModalityId}
                onChange={(e) => setProgramModalityId(e.target.value)}
              >
                {modalities.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
              <select className="admin-input" value={programUnitId} onChange={(e) => setProgramUnitId(e.target.value)}>
                <option value="">Toda a organização</option>
                {units.map((unit) => (
                  <option key={unit.id} value={unit.id}>
                    {unit.name}
                  </option>
                ))}
              </select>
              <div className="grid gap-2 rounded-2xl border border-[color:var(--app-border)] p-3">
                <span className="text-xs font-semibold uppercase tracking-wide text-sand-muted">Sessões</span>
                <select
                  className="admin-input"
                  value={programBlockId}
                  onChange={(e) => setProgramBlockId(e.target.value)}
                >
                  <option value="">Selecione divisão</option>
                  {filteredProgramBlocks.map((block) => (
                    <option key={block.id} value={block.id}>
                      {block.title} {block.sourceType === "COACH" ? "· meu" : "· plataforma"}
                    </option>
                  ))}
                </select>
                <div className="flex gap-2">
                  <input
                    className="admin-input w-24"
                    type="number"
                    min={1}
                    value={programDayNumber}
                    onChange={(e) => setProgramDayNumber(Number(e.target.value) || 1)}
                  />
                  <button
                    type="button"
                    className="admin-secondary-button"
                    disabled={!programBlockId}
                    onClick={addProgramDay}
                  >
                    Adicionar sessão
                  </button>
                </div>
                {programDays.length > 0 && (
                  <ul className="grid gap-1 text-sm text-sand-muted">
                    {programDays.map((day, index) => (
                      <li key={`${day.workoutBlockId}-${index}`} className="flex justify-between gap-2">
                        <span>{day.label}</span>
                        <button
                          type="button"
                          className="text-red-400"
                          onClick={() => setProgramDays((current) => current.filter((_, i) => i !== index))}
                        >
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
                disabled={busy || programTitle.trim().length < 2 || !programModalityId || programDays.length === 0}
                onClick={() =>
                  void onBusy(async () => {
                    await apiPost(
                      "/org/programs",
                      {
                        organizationId,
                        unitId: programUnitId || undefined,
                        modalityId: programModalityId,
                        title: programTitle.trim(),
                        sourceType: "COACH",
                        targetGender: "ALL",
                        days: programDays.map(({ workoutBlockId, dayNumber, order }) => ({
                          workoutBlockId,
                          dayNumber,
                          order
                        }))
                      },
                      token
                    );
                    setProgramTitle("");
                    setProgramDays([]);
                    setProgramDayNumber(1);
                    await load();
                  }, "Programa criado (rascunho).")
                }
              >
                Criar rascunho
              </button>
            </div>
          </article>

          <article className="rounded-3xl border border-[color:var(--app-border)] bg-[var(--app-panel)] p-5">
            <h3 className="mb-4 text-base font-bold">Meus programas</h3>
            {programs.length === 0 ? (
              <p className="text-sm text-sand-muted">Nenhum programa ainda.</p>
            ) : (
              <ul className="grid gap-2 text-sm">
                {programs.map((program) => (
                  <li
                    key={program.id}
                    className="rounded-2xl border border-[color:var(--app-border)] px-4 py-3"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <strong>{program.title}</strong>
                        <span className="block text-xs text-sand-muted">
                          {program.status} · {program.days.length} sessão(ões) · {program.assignedUsers.length}{" "}
                          atribuição(ões)
                        </span>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {program.status !== "PUBLISHED" && (
                          <button
                            type="button"
                            className="admin-secondary-button"
                            disabled={busy}
                            onClick={() =>
                              void onBusy(async () => {
                                await apiPost(`/org/programs/${program.id}/publish`, {}, token);
                                await load();
                              }, "Programa publicado.")
                            }
                          >
                            <Upload size={14} /> Publicar
                          </button>
                        )}
                        {program.status === "PUBLISHED" && (
                          <button
                            type="button"
                            className="admin-secondary-button"
                            disabled={busy}
                            onClick={() =>
                              void onBusy(async () => {
                                await apiPost(`/org/programs/${program.id}/archive`, {}, token);
                                await load();
                              }, "Programa arquivado.")
                            }
                          >
                            Arquivar
                          </button>
                        )}
                        {program.status === "DRAFT" && (
                          <button
                            type="button"
                            className="admin-secondary-button text-red-400"
                            disabled={busy}
                            onClick={() =>
                              void onBusy(async () => {
                                await apiDelete(`/org/programs/${program.id}`, token);
                                await load();
                              }, "Programa removido.")
                            }
                          >
                            <Trash2 size={14} />
                          </button>
                        )}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </article>
        </div>
      )}

      {step === "distribute" && (
        <div className="grid gap-6 lg:grid-cols-2">
          <article className="rounded-3xl border border-[color:var(--app-border)] bg-[var(--app-panel)] p-5">
            <h3 className="mb-4 text-base font-bold">Distribuir para toda a base</h3>
            <p className="mb-4 text-sm text-sand-muted">
              Atribui o programa publicado a todos os alunos vinculados a você nesta organização (
              {assignedAthletes.length} aluno(s)).
            </p>
            <select
              className="admin-input mb-3"
              value={assignProgramId}
              onChange={(e) => setAssignProgramId(e.target.value)}
            >
              <option value="">Programa publicado</option>
              {publishedPrograms.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.title}
                </option>
              ))}
            </select>
            <button
              type="button"
              className="admin-primary-button"
              disabled={busy || !assignProgramId || assignedAthletes.length === 0}
              onClick={() =>
                void onBusy(async () => {
                  const result = await apiPost<{ assignedCount: number }>(
                    `/org/programs/${assignProgramId}/distribute-base`,
                    { organizationId },
                    token
                  );
                  await load();
                  if (result.assignedCount === 0) {
                    throw new Error("Nenhum aluno recebeu o programa.");
                  }
                }, "Programa distribuído para sua base.")
              }
            >
              <Send size={16} /> Distribuir para base
            </button>
          </article>

          <article className="rounded-3xl border border-[color:var(--app-border)] bg-[var(--app-panel)] p-5">
            <h3 className="mb-4 text-base font-bold">Atribuir a aluno específico</h3>
            <div className="grid gap-3">
              <select
                className="admin-input"
                value={assignProgramId}
                onChange={(e) => setAssignProgramId(e.target.value)}
              >
                <option value="">Programa publicado</option>
                {publishedPrograms.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.title}
                  </option>
                ))}
              </select>
              <select
                className="admin-input"
                value={assignAthleteId}
                onChange={(e) => setAssignAthleteId(e.target.value)}
              >
                <option value="">Aluno</option>
                {assignedAthletes.map((athlete) => (
                  <option key={athlete.id} value={athlete.id}>
                    {athlete.name}
                  </option>
                ))}
              </select>
              <button
                type="button"
                className="admin-primary-button"
                disabled={busy || !assignProgramId || !assignAthleteId}
                onClick={() =>
                  void onBusy(async () => {
                    await apiPost(
                      `/org/programs/${assignProgramId}/assign`,
                      { athleteIds: [assignAthleteId] },
                      token
                    );
                    setAssignAthleteId("");
                    await load();
                  }, "Programa atribuído ao aluno.")
                }
              >
                Atribuir
              </button>
            </div>
          </article>
        </div>
      )}
    </section>
  );
}
