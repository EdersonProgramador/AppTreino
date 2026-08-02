import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Check, Grid2X2, Pause, Play, Trophy, X } from "lucide-react";

export interface WorkoutPlayerExercise {
  id: string;
  title: string;
  videoUrl: string;
  targetMuscles?: string[];
  equipmentTags?: string[];
  sets: number;
  repsRange: string;
  restSeconds?: number;
  latestWeightUsed?: number;
  order: number;
  alternatives?: Array<{
    id: string;
    title: string;
    videoUrl: string;
  }>;
}

interface WorkoutPlayerProps {
  programTitle: string;
  blockTitle: string;
  exercises: WorkoutPlayerExercise[];
  restTimeDefault: number;
  sessionId?: string | null;
  sessionStartedAt?: string | null;
  onBack: () => void;
  onCancelSession?: () => Promise<void> | void;
  onExerciseProgressChange?: (input: {
    exerciseId: string;
    completed: boolean;
    weightUsed: number;
    repsCompleted: number;
    sets: number;
  }) => Promise<void> | void;
  onWorkoutComplete?: () => Promise<void> | void;
}

function formatElapsedTime(totalSeconds: number) {
  const safeSeconds = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(safeSeconds / 3600);
  const minutes = Math.floor((safeSeconds % 3600) / 60);
  const seconds = safeSeconds % 60;

  return [hours, minutes, seconds].map((item) => String(item).padStart(2, "0")).join(":");
}

function parseReps(repsRange: string) {
  const match = repsRange.match(/\d+/);
  return match ? Number(match[0]) : 0;
}

function isVideoMedia(url: string) {
  return /\.(mp4|webm|ogg|mov)(\?|#|$)/i.test(url);
}

function mediaAlt(exercise: WorkoutPlayerExercise) {
  return `Mídia do exercício ${exercise.title}`;
}

function exerciseInstanceKey(exercise: WorkoutPlayerExercise) {
  return `${exercise.id}-${exercise.order}`;
}

export function WorkoutPlayer({
  programTitle,
  blockTitle,
  exercises,
  restTimeDefault,
  sessionStartedAt,
  onBack,
  onCancelSession,
  onExerciseProgressChange,
  onWorkoutComplete
}: WorkoutPlayerProps) {
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [isRunning, setIsRunning] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [completedIds, setCompletedIds] = useState<Set<string>>(() => new Set());
  const [dayCompleted, setDayCompleted] = useState(false);
  const [loads, setLoads] = useState<Record<string, string>>(() =>
    Object.fromEntries(exercises.map((exercise) => [exerciseInstanceKey(exercise), exercise.latestWeightUsed ? String(exercise.latestWeightUsed) : ""]))
  );

  const completedCount = completedIds.size;
  const allCompleted = exercises.length > 0 && completedCount === exercises.length;

  useEffect(() => {
    setLoads(
      Object.fromEntries(exercises.map((exercise) => [exerciseInstanceKey(exercise), exercise.latestWeightUsed ? String(exercise.latestWeightUsed) : ""]))
    );
    setCompletedIds(new Set());
    setDayCompleted(false);
  }, [exercises]);

  useEffect(() => {
    if (!isRunning || isPaused) return;

    const getBaseSeconds = () => {
      if (!sessionStartedAt) return elapsedSeconds;

      return Math.max(0, Math.round((Date.now() - new Date(sessionStartedAt).getTime()) / 1000));
    };

    setElapsedSeconds(getBaseSeconds());
    const interval = window.setInterval(() => {
      setElapsedSeconds((current) => (sessionStartedAt ? getBaseSeconds() : current + 1));
    }, 1000);

    return () => window.clearInterval(interval);
  }, [elapsedSeconds, isPaused, isRunning, sessionStartedAt]);

  useEffect(() => {
    if (!allCompleted || dayCompleted) return;

    setDayCompleted(true);
    void onWorkoutComplete?.();
  }, [allCompleted, dayCompleted, onWorkoutComplete]);

  async function toggleExercise(exercise: WorkoutPlayerExercise) {
    const instanceKey = exerciseInstanceKey(exercise);
    const nextCompleted = !completedIds.has(instanceKey);
    const nextSet = new Set(completedIds);

    if (nextCompleted) {
      nextSet.add(instanceKey);
    } else {
      nextSet.delete(instanceKey);
      setDayCompleted(false);
    }

    setCompletedIds(nextSet);

    try {
      await onExerciseProgressChange?.({
        exerciseId: exercise.id,
        completed: nextCompleted,
        weightUsed: Number(loads[instanceKey] || 0),
        repsCompleted: parseReps(exercise.repsRange),
        sets: exercise.sets
      });
    } catch {
      setCompletedIds(completedIds);
    }
  }

  async function confirmCancel() {
    await onCancelSession?.();
    setCancelOpen(false);
    onBack();
  }

  if (exercises.length === 0) {
    return <div className="workout-player-empty">Nenhum exercício carregado.</div>;
  }

  return (
    <div className="workout-runner">
      <header className="workout-runner-header">
        <button aria-label="Voltar para treinos" onClick={onBack}>
          <ArrowLeft size={28} />
        </button>
        <div>
          <strong>{blockTitle || programTitle}</strong>
          <span>{formatElapsedTime(elapsedSeconds)}</span>
        </div>
        <button aria-label="Alternar grade" onClick={() => setDetailsOpen((current) => !current)}>
          <Grid2X2 size={28} />
        </button>
      </header>

      <main className="workout-runner-body">
        <div className="workout-runner-summary">
          <span>{programTitle}</span>
          <strong>{completedCount}/{exercises.length}</strong>
        </div>

        {exercises.map((exercise) => {
          const instanceKey = exerciseInstanceKey(exercise);
          const isCompleted = completedIds.has(instanceKey);
          const muscles = (exercise.targetMuscles ?? []).join(", ") || "Grupo muscular não informado";
          const restSeconds = exercise.restSeconds ?? restTimeDefault;
          const mediaUrl = exercise.videoUrl;
          const shouldExpandVideo = isRunning && Boolean(mediaUrl) && isVideoMedia(mediaUrl);

          return (
            <article className={`workout-runner-card ${isCompleted ? "completed" : ""}`} key={instanceKey}>
              <div className="runner-exercise-main">
                <div className={`runner-media ${shouldExpandVideo ? "expanded" : ""}`}>
                  {mediaUrl ? (
                    isVideoMedia(mediaUrl) ? (
                      <video src={mediaUrl} controls={shouldExpandVideo} autoPlay={shouldExpandVideo} loop muted playsInline />
                    ) : (
                      <img src={mediaUrl} alt={mediaAlt(exercise)} />
                    )
                  ) : (
                    <Trophy size={28} />
                  )}
                </div>
                <div className="runner-exercise-copy">
                  <strong>{exercise.title}</strong>
                  <span>{muscles}</span>
                </div>
                <button
                  className={`runner-toggle ${isCompleted ? "checked" : ""}`}
                  aria-label={isCompleted ? "Desmarcar treino concluído" : "Marcar treino concluído"}
                  onClick={() => void toggleExercise(exercise)}
                >
                  <span>{isCompleted && <Check size={18} />}</span>
                </button>
              </div>

              {detailsOpen && (
                <div className="runner-metrics">
                  <div>
                    <span>Série</span>
                    <strong>{exercise.sets}</strong>
                  </div>
                  <div>
                    <span>Repetições</span>
                    <strong>{exercise.repsRange}</strong>
                  </div>
                  <label>
                    <span>Carga/Velocidade</span>
                    <input
                      type="number"
                      min="0"
                      inputMode="decimal"
                      value={loads[instanceKey] ?? ""}
                      onChange={(event) => setLoads((current) => ({ ...current, [instanceKey]: event.target.value }))}
                      placeholder="0"
                    />
                  </label>
                  <div>
                    <span>Descanso</span>
                    <strong>{restSeconds}s</strong>
                  </div>
                </div>
              )}
            </article>
          );
        })}
      </main>

      <footer className="workout-runner-controls">
        <button className="runner-round-button" aria-label="Cancelar treino" onClick={() => setCancelOpen(true)}>
          <X size={24} />
        </button>
        <button
          className="runner-start-button"
          aria-label="Iniciar sequência do treino"
          onClick={() => {
            setIsRunning(true);
            setIsPaused(false);
          }}
        >
          <Trophy size={32} />
          <span>Iniciar</span>
        </button>
        <button className="runner-round-button" aria-label="Pausar cronograma de tempo" onClick={() => setIsPaused((current) => !current)}>
          {isPaused ? <Play size={24} /> : <Pause size={24} />}
        </button>
      </footer>

      {cancelOpen && (
        <div className="runner-confirm-backdrop" role="presentation" onClick={() => setCancelOpen(false)}>
          <section className="runner-confirm-modal" role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}>
            <h2>Deseja cancelar o treino?</h2>
            <p>Ao confirmar, a execução atual será cancelada.</p>
            <div>
              <button className="confirm-yes" onClick={() => void confirmCancel()}>
                SIM
              </button>
              <button className="confirm-no" onClick={() => setCancelOpen(false)}>
                Não
              </button>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
