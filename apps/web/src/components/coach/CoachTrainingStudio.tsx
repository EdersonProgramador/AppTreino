import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  Check,
  ClipboardList,
  Dumbbell,
  Loader2,
  Megaphone,
  Play,
  Plus,
  RefreshCw,
  Save,
  Send,
  Trash2,
  Upload,
  UploadCloud,
  UserRound,
  UsersRound
} from "lucide-react";
import { trainingCopy } from "../../lib/training-copy";
import {
  cmsFormClass,
  cmsStudioCardClass,
  crudFormClass,
  dataRowClass,
  deleteActionButtonClass,
  panelTitleClass,
  wideFieldClass
} from "../../lib/admin-cms-classes";
import { apiDelete, apiGet, apiPost } from "../../api";

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

type StudioStep = "modalities" | "lessons" | "blocks" | "publish" | "distribute";

type Props = {
  token: string;
  organizationId: string;
  organizationName: string;
  units: Unit[];
  assignedAthletes: OrgUser[];
  busy: boolean;
  onBusy: (action: () => Promise<void>, success: string) => Promise<void>;
  onError: (message: string) => void;
};

export function CoachTrainingStudio({
  token,
  organizationId,
  organizationName,
  units,
  assignedAthletes,
  busy,
  onBusy,
  onError
}: Props) {
  const [step, setStep] = useState<StudioStep>("lessons");
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

  const activeModalities = useMemo(() => modalities.filter((item) => item.isActive), [modalities]);
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
  const draftPrograms = useMemo(
    () => programs.filter((item) => item.status === "DRAFT"),
    [programs]
  );

  const workflowSummary = useMemo(() => {
    const exercisesWithoutModality = ownExercises.filter((item) => item.modalityLinks.length === 0).length;
    const blocksWithoutModality = ownBlocks.filter((item) => !item.modality?.id).length;
    const blocksWithoutExercises = ownBlocks.filter((item) => item.exercises.length === 0).length;
    const draftsReady = draftPrograms.filter((item) => item.days.length > 0).length;
    return {
      exercises: { total: ownExercises.length, withoutModality: exercisesWithoutModality },
      workoutBlocks: {
        total: ownBlocks.length,
        withoutModality: blocksWithoutModality,
        withoutExercises: blocksWithoutExercises
      },
      programs: { published: publishedPrograms.length, draftsReady, total: programs.length },
      modalities: { active: activeModalities.length, total: modalities.length }
    };
  }, [activeModalities.length, draftPrograms, modalities.length, ownBlocks, ownExercises, programs.length, publishedPrograms.length]);

  const stepCards = useMemo(
    () => [
      {
        id: "modalities" as const,
        icon: Dumbbell,
        title: trainingCopy.coachStepModalities,
        text: "Catálogo ATLLY disponível para montar suas fichas.",
        metric: `${workflowSummary.modalities.active} ativa(s)`
      },
      {
        id: "lessons" as const,
        icon: UploadCloud,
        title: trainingCopy.coachStepExercises,
        text: "Cadastre exercícios próprios com vídeo e observações.",
        metric:
          workflowSummary.exercises.withoutModality > 0
            ? `${workflowSummary.exercises.total} exercício(s) · ${workflowSummary.exercises.withoutModality} sem modalidade`
            : `${workflowSummary.exercises.total} exercício(s)`
      },
      {
        id: "blocks" as const,
        icon: ClipboardList,
        title: trainingCopy.coachStepDivisions,
        text: "Monte divisões vinculadas à modalidade.",
        metric: `${workflowSummary.workoutBlocks.total} divisão(ões)`
      },
      {
        id: "publish" as const,
        icon: Check,
        title: trainingCopy.coachStepPublish,
        text: "Ciclos multi-dia (ABC) e publicação para alunos.",
        metric: `${workflowSummary.programs.published} publicado(s) · ${workflowSummary.programs.draftsReady} rascunho(s)`
      },
      {
        id: "distribute" as const,
        icon: Send,
        title: trainingCopy.coachStepDistribute,
        text: "Atribua programas publicados à sua base.",
        metric: `${assignedAthletes.length} aluno(s) vinculado(s)`
      }
    ],
    [assignedAthletes.length, workflowSummary]
  );

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const [modalitiesData, exercisesData, blocksData, programsData] = await Promise.all([
        apiGet<{ modalities: Modality[] }>("/org/me/training/modalities", token),
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
      const firstModality = modalitiesData.modalities.find((item) => item.isActive)?.id ?? "";
      setExerciseModalityId((current) => current || firstModality);
      setBlockModalityId((current) => current || firstModality);
      setProgramModalityId((current) => current || firstModality);
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
      <article className={`${cmsStudioCardClass} text-sm text-red-400`}>
        <p className="m-0">{loadError}</p>
        <button type="button" className="outline-button mt-3" onClick={() => void load()}>
          <RefreshCw size={16} /> Tentar novamente
        </button>
      </article>
    );
  }

  return (
    <article className="table-panel wide-panel cms-panel coach-studio-shell admin-workspace-shell" id="coach-training-studio">
      <div className={panelTitleClass}>
        <h2>{trainingCopy.coachStudioTitle}</h2>
        <span>{organizationName}</span>
      </div>

      <div className="cms-hero">
        <div>
          <span className="eyebrow">{trainingCopy.coachStudioTitle}</span>
          <h3>Monte exercícios, organize divisões e publique ciclos para seus alunos.</h3>
          <p>{trainingCopy.coachStudioFlowHint}</p>
          <p className="mt-2 text-sm text-brand-gold">
            {trainingCopy.coachOrgScopeLabel}: <strong>{organizationName}</strong>
            {units.length ? ` · ${units.length} unidade(s)` : ""}
          </p>
        </div>
        <div className="cms-hero-metrics">
          <span>
            <UploadCloud size={18} />
            <strong>{ownExercises.length}</strong>
            <small>{trainingCopy.exercises}</small>
          </span>
          <span>
            <UsersRound size={18} />
            <strong>{activeModalities.length}</strong>
            <small>{trainingCopy.modalities}</small>
          </span>
          <span>
            <Play size={18} />
            <strong>{ownBlocks.length}</strong>
            <small>{trainingCopy.divisions}</small>
          </span>
          <span>
            <UserRound size={18} />
            <strong>{assignedAthletes.length}</strong>
            <small>Alunos vinculados</small>
          </span>
        </div>
      </div>

      <div className="cms-workflow" aria-label="Etapas do estúdio coach">
        {stepCards.map((item, index) => (
          <button
            key={item.id}
            type="button"
            className={step === item.id ? "active" : ""}
            onClick={() => setStep(item.id)}
          >
            <strong>{index + 1}</strong>
            <span>
              <item.icon size={18} />
              {item.title}
            </span>
            <small>{item.text}</small>
            <small className="cms-step-metric">{item.metric}</small>
          </button>
        ))}
      </div>

      {(workflowSummary.exercises.withoutModality > 0 ||
        workflowSummary.workoutBlocks.withoutModality > 0 ||
        workflowSummary.workoutBlocks.withoutExercises > 0 ||
        workflowSummary.programs.draftsReady > 0) && (
        <div className="cms-workflow-alerts">
          {workflowSummary.exercises.withoutModality > 0 && (
            <p>
              <AlertCircle size={16} />
              {workflowSummary.exercises.withoutModality} exercício(s) sem modalidade vinculada.
            </p>
          )}
          {workflowSummary.workoutBlocks.withoutModality > 0 && (
            <p>
              <AlertCircle size={16} />
              {workflowSummary.workoutBlocks.withoutModality} divisão(ões) sem modalidade.
            </p>
          )}
          {workflowSummary.workoutBlocks.withoutExercises > 0 && (
            <p>
              <AlertCircle size={16} />
              {workflowSummary.workoutBlocks.withoutExercises} divisão(ões) sem exercícios.
            </p>
          )}
          {workflowSummary.programs.draftsReady > 0 && (
            <p>
              <Megaphone size={16} />
              {workflowSummary.programs.draftsReady} ciclo(s) em rascunho prontos para publicar.
            </p>
          )}
        </div>
      )}

      <div className="cms-admin-grid cms-studio-grid">
        {step === "modalities" && (
          <section className={cmsStudioCardClass}>
            <div className={`${panelTitleClass} cms-subtitle`}>
              <div>
                <h2>{trainingCopy.coachStepModalities}</h2>
                <p>Modalidades globais ATLLY usadas para organizar exercícios, divisões e ciclos.</p>
              </div>
              <span>{activeModalities.length}</span>
            </div>
            <div className="cms-chip-group">
              {activeModalities.length === 0 ? (
                <p className="cms-empty-hint">Nenhuma modalidade ativa no catálogo.</p>
              ) : (
                activeModalities.map((item) => (
                  <span className="cms-chip is-static" key={item.id}>
                    {item.name}
                  </span>
                ))
              )}
            </div>
            <p className="mt-4 text-sm text-sand-muted">
              Coaches usam o catálogo da plataforma. Para novas modalidades, solicite ao administrador da organização.
            </p>
          </section>
        )}

        {step === "lessons" && (
          <>
            <section className={cmsStudioCardClass}>
              <div className={`${panelTitleClass} cms-subtitle`}>
                <div>
                  <h2>{trainingCopy.coachStepExercises}</h2>
                  <p>Cadastre exercícios próprios com vídeo e instruções para montar divisões.</p>
                </div>
                <span>{ownExercises.length}</span>
              </div>
              <div className={`${crudFormClass} ${cmsFormClass}`}>
                <label className={wideFieldClass}>
                  Título do exercício
                  <input
                    className="admin-input"
                    placeholder="Ex.: Agachamento livre"
                    value={exerciseTitle}
                    onChange={(e) => setExerciseTitle(e.target.value)}
                  />
                </label>
                <label>
                  Modalidade
                  <select
                    className="admin-input"
                    value={exerciseModalityId}
                    onChange={(e) => setExerciseModalityId(e.target.value)}
                  >
                    {activeModalities.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className={wideFieldClass}>
                  URL do vídeo (opcional)
                  <input
                    className="admin-input"
                    placeholder="https://.../exercicio.mp4"
                    value={exerciseVideoUrl}
                    onChange={(e) => setExerciseVideoUrl(e.target.value)}
                  />
                </label>
                <label className={wideFieldClass}>
                  Instruções de execução
                  <textarea
                    className="admin-input min-h-[96px]"
                    placeholder="Postura, cadência, cuidados..."
                    value={exerciseNotes}
                    onChange={(e) => setExerciseNotes(e.target.value)}
                  />
                </label>
                <button
                  type="button"
                  className="primary-button"
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
                  <Save size={18} /> Salvar exercício
                </button>
              </div>
            </section>

            <section className={cmsStudioCardClass}>
              <div className={`${panelTitleClass} cms-subtitle`}>
                <div>
                  <h2>{trainingCopy.coachContentOwnLabel}</h2>
                  <p>Exercícios que você produziu nesta organização.</p>
                </div>
                <span>{ownExercises.length}</span>
              </div>
              {ownExercises.length === 0 ? (
                <p className="text-sm text-sand-muted">Nenhum exercício próprio ainda.</p>
              ) : (
                ownExercises.map((item) => (
                  <div className={dataRowClass} key={item.id}>
                    <span>
                      <strong>{item.title}</strong>
                      <small>{item.modalityLinks.map((link) => link.modality.name).join(" · ")}</small>
                    </span>
                    <button
                      type="button"
                      className={deleteActionButtonClass}
                      disabled={busy}
                      aria-label="Remover exercício"
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
                      <Trash2 size={17} />
                    </button>
                  </div>
                ))
              )}
              <p className="mt-3 text-xs text-sand-muted">
                {trainingCopy.coachContentPlatformLabel}: {exercises.length - ownExercises.length} exercício(s)
                disponíveis para montar divisões.
              </p>
            </section>
          </>
        )}

        {step === "blocks" && (
          <>
            <section className={cmsStudioCardClass}>
              <div className={`${panelTitleClass} cms-subtitle`}>
                <div>
                  <h2>{trainingCopy.coachStepDivisions}</h2>
                  <p>Monte a ficha, vincule modalidade e sequência de exercícios.</p>
                </div>
                <span>{ownBlocks.length}</span>
              </div>
              <div className={`${crudFormClass} ${cmsFormClass}`}>
                <label className={wideFieldClass}>
                  Título da divisão
                  <input
                    className="admin-input"
                    placeholder="Ex.: Peito e tríceps · Sessão A"
                    value={blockTitle}
                    onChange={(e) => setBlockTitle(e.target.value)}
                  />
                </label>
                <label>
                  Modalidade
                  <select
                    className="admin-input"
                    value={blockModalityId}
                    onChange={(e) => setBlockModalityId(e.target.value)}
                  >
                    {activeModalities.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Descanso padrão (seg)
                  <input
                    className="admin-input"
                    type="number"
                    min={0}
                    value={blockRestTime}
                    onChange={(e) => setBlockRestTime(Number(e.target.value) || 0)}
                  />
                </label>
                <div className={`${cmsStudioCardClass} col-span-full grid gap-2`}>
                  <span className="text-xs font-semibold uppercase tracking-wide text-sand-muted">Exercícios da ficha</span>
                  <select
                    className="admin-input"
                    value={blockExerciseId}
                    onChange={(e) => setBlockExerciseId(e.target.value)}
                  >
                    <option value="">Selecione exercício</option>
                    {exercises
                      .filter(
                        (item) =>
                          !blockModalityId ||
                          item.modalityLinks.some((link) => link.modality.id === blockModalityId)
                      )
                      .map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.title}{" "}
                          {item.sourceType === "COACH" ? "· meu" : "· plataforma"}
                        </option>
                      ))}
                  </select>
                  <div className="flex flex-wrap gap-2">
                    <input
                      className="admin-input w-20"
                      type="number"
                      min={1}
                      value={blockSets}
                      onChange={(e) => setBlockSets(Number(e.target.value) || 1)}
                    />
                    <input
                      className="admin-input min-w-[120px] flex-1"
                      value={blockReps}
                      onChange={(e) => setBlockReps(e.target.value)}
                      placeholder="Reps (ex: 8-12)"
                    />
                    <button
                      type="button"
                      className="outline-button"
                      disabled={!blockExerciseId}
                      onClick={addBlockExercise}
                    >
                      <Plus size={16} /> Adicionar
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
                  className="primary-button"
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
                  <Save size={18} /> Salvar divisão
                </button>
              </div>
            </section>

            <section className={cmsStudioCardClass}>
              <div className={`${panelTitleClass} cms-subtitle`}>
                <div>
                  <h2>Minhas divisões</h2>
                  <p>Divisões produzidas por você nesta organização.</p>
                </div>
                <span>{ownBlocks.length}</span>
              </div>
              {ownBlocks.length === 0 ? (
                <p className="text-sm text-sand-muted">Nenhuma divisão própria ainda.</p>
              ) : (
                ownBlocks.map((item) => (
                  <div className={dataRowClass} key={item.id}>
                    <span>
                      <strong>{item.title}</strong>
                      <small>
                        {item.modality?.name ?? "—"} · {item.exercises.length} exercício(s)
                      </small>
                    </span>
                    <button
                      type="button"
                      className={deleteActionButtonClass}
                      disabled={busy}
                      aria-label="Remover divisão"
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
                      <Trash2 size={17} />
                    </button>
                  </div>
                ))
              )}
            </section>
          </>
        )}

        {step === "publish" && (
          <>
            <section className={cmsStudioCardClass}>
              <div className={`${panelTitleClass} cms-subtitle`}>
                <div>
                  <h2>{trainingCopy.coachStepPublish}</h2>
                  <p>Monte ciclos multi-dia e publique para liberar aos alunos.</p>
                </div>
                <span>{programs.length}</span>
              </div>
              <div className={`${crudFormClass} ${cmsFormClass}`}>
                <label className={wideFieldClass}>
                  Título do ciclo
                  <input
                    className="admin-input"
                    placeholder="Ex.: Hipertrofia · 4 semanas"
                    value={programTitle}
                    onChange={(e) => setProgramTitle(e.target.value)}
                  />
                </label>
                <label>
                  Modalidade
                  <select
                    className="admin-input"
                    value={programModalityId}
                    onChange={(e) => setProgramModalityId(e.target.value)}
                  >
                    {activeModalities.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Unidade (opcional)
                  <select className="admin-input" value={programUnitId} onChange={(e) => setProgramUnitId(e.target.value)}>
                    <option value="">Toda a organização</option>
                    {units.map((unit) => (
                      <option key={unit.id} value={unit.id}>
                        {unit.name}
                      </option>
                    ))}
                  </select>
                </label>
                <div className={`${cmsStudioCardClass} col-span-full grid gap-2`}>
                  <span className="text-xs font-semibold uppercase tracking-wide text-sand-muted">Sessões do ciclo</span>
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
                  <div className="flex flex-wrap gap-2">
                    <input
                      className="admin-input w-24"
                      type="number"
                      min={1}
                      value={programDayNumber}
                      onChange={(e) => setProgramDayNumber(Number(e.target.value) || 1)}
                    />
                    <button type="button" className="outline-button" disabled={!programBlockId} onClick={addProgramDay}>
                      <Plus size={16} /> Adicionar sessão
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
                  className="primary-button"
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
                    }, "Ciclo criado (rascunho).")
                  }
                >
                  <Save size={18} /> Criar rascunho
                </button>
              </div>
            </section>

            <section className={cmsStudioCardClass}>
              <div className={`${panelTitleClass} cms-subtitle`}>
                <div>
                  <h2>Meus ciclos</h2>
                  <p>Publique rascunhos ou arquive programas ativos.</p>
                </div>
                <span>{programs.length}</span>
              </div>
              {programs.length === 0 ? (
                <p className="text-sm text-sand-muted">Nenhum ciclo ainda.</p>
              ) : (
                programs.map((program) => (
                  <div className={dataRowClass} key={program.id}>
                    <span>
                      <strong>{program.title}</strong>
                      <small>
                        {program.status} · {program.days.length} sessão(ões) · {program.assignedUsers.length}{" "}
                        atribuição(ões)
                      </small>
                    </span>
                    <div className="flex flex-wrap gap-2">
                      {program.status !== "PUBLISHED" && (
                        <button
                          type="button"
                          className="outline-button compact-button"
                          disabled={busy}
                          onClick={() =>
                            void onBusy(async () => {
                              await apiPost(`/org/programs/${program.id}/publish`, {}, token);
                              await load();
                            }, "Ciclo publicado.")
                          }
                        >
                          <Upload size={14} /> Publicar
                        </button>
                      )}
                      {program.status === "PUBLISHED" && (
                        <button
                          type="button"
                          className="outline-button compact-button"
                          disabled={busy}
                          onClick={() =>
                            void onBusy(async () => {
                              await apiPost(`/org/programs/${program.id}/archive`, {}, token);
                              await load();
                            }, "Ciclo arquivado.")
                          }
                        >
                          Arquivar
                        </button>
                      )}
                      {program.status === "DRAFT" && (
                        <button
                          type="button"
                          className={deleteActionButtonClass}
                          disabled={busy}
                          onClick={() =>
                            void onBusy(async () => {
                              await apiDelete(`/org/programs/${program.id}`, token);
                              await load();
                            }, "Ciclo removido.")
                          }
                        >
                          <Trash2 size={17} />
                        </button>
                      )}
                    </div>
                  </div>
                ))
              )}
            </section>
          </>
        )}

        {step === "distribute" && (
          <>
            <section className={cmsStudioCardClass}>
              <div className={`${panelTitleClass} cms-subtitle`}>
                <div>
                  <h2>Distribuir para toda a base</h2>
                  <p>
                    Atribui o ciclo publicado a todos os alunos vinculados a você em {organizationName} (
                    {assignedAthletes.length} aluno(s)).
                  </p>
                </div>
              </div>
              <div className={`${crudFormClass} ${cmsFormClass}`}>
                <label className={wideFieldClass}>
                  Ciclo publicado
                  <select
                    className="admin-input"
                    value={assignProgramId}
                    onChange={(e) => setAssignProgramId(e.target.value)}
                  >
                    <option value="">Selecione um ciclo</option>
                    {publishedPrograms.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.title}
                      </option>
                    ))}
                  </select>
                </label>
                <button
                  type="button"
                  className="primary-button"
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
                        throw new Error("Nenhum aluno recebeu o ciclo.");
                      }
                    }, "Ciclo distribuído para sua base.")
                  }
                >
                  <Send size={16} /> Distribuir para base
                </button>
              </div>
            </section>

            <section className={cmsStudioCardClass}>
              <div className={`${panelTitleClass} cms-subtitle`}>
                <div>
                  <h2>Atribuir a aluno específico</h2>
                  <p>Envie um ciclo publicado para um aluno da sua carteira.</p>
                </div>
              </div>
              <div className={`${crudFormClass} ${cmsFormClass}`}>
                <label>
                  Ciclo publicado
                  <select
                    className="admin-input"
                    value={assignProgramId}
                    onChange={(e) => setAssignProgramId(e.target.value)}
                  >
                    <option value="">Selecione um ciclo</option>
                    {publishedPrograms.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.title}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Aluno
                  <select
                    className="admin-input"
                    value={assignAthleteId}
                    onChange={(e) => setAssignAthleteId(e.target.value)}
                  >
                    <option value="">Selecione aluno</option>
                    {assignedAthletes.map((athlete) => (
                      <option key={athlete.id} value={athlete.id}>
                        {athlete.name}
                      </option>
                    ))}
                  </select>
                </label>
                <button
                  type="button"
                  className="primary-button"
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
                    }, "Ciclo atribuído ao aluno.")
                  }
                >
                  <Send size={16} /> Atribuir aluno
                </button>
              </div>
            </section>
          </>
        )}
      </div>
    </article>
  );
}
