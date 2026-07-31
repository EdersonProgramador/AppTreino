import { useEffect, useMemo, useState } from "react";
import { Check, Dumbbell, RefreshCw, Timer } from "lucide-react";

export interface WorkoutPlayerExercise {
  id: string;
  title: string;
  videoUrl: string;
  targetMuscles?: string[];
  equipmentTags?: string[];
  sets: number;
  repsRange: string;
  order: number;
  alternatives?: Array<{
    id: string;
    title: string;
    videoUrl: string;
  }>;
}

interface WorkoutPlayerProps {
  exercises: WorkoutPlayerExercise[];
  restTimeDefault: number;
  onRequestSubstitutes: (exerciseId: string) => Promise<WorkoutPlayerExercise["alternatives"]>;
}

export function WorkoutPlayer({ exercises, restTimeDefault, onRequestSubstitutes }: WorkoutPlayerProps) {
  const [currentIdx, setCurrentIdx] = useState(0);
  const [currentSet, setCurrentSet] = useState(1);
  const [timer, setTimer] = useState(0);
  const [isResting, setIsResting] = useState(false);
  const [loadKg, setLoadKg] = useState("");
  const [isFinished, setIsFinished] = useState(false);
  const [alternatives, setAlternatives] = useState<WorkoutPlayerExercise["alternatives"]>([]);
  const [alternativesOpen, setAlternativesOpen] = useState(false);
  const [alternativesLoading, setAlternativesLoading] = useState(false);

  const activeExercise = exercises[currentIdx];
  const visibleAlternatives = alternatives ?? [];
  const progressLabel = useMemo(() => `${currentIdx + 1}/${Math.max(exercises.length, 1)}`, [currentIdx, exercises.length]);

  useEffect(() => {
    if (!isResting || timer <= 0) {
      if (isResting && timer === 0) {
        setIsResting(false);
      }
      return;
    }

    const interval = window.setInterval(() => setTimer((current) => current - 1), 1000);
    return () => window.clearInterval(interval);
  }, [isResting, timer]);

  function handleCompleteSet() {
    if (!activeExercise) return;

    if (currentSet < activeExercise.sets) {
      setCurrentSet((current) => current + 1);
      setTimer(restTimeDefault);
      setIsResting(true);
      return;
    }

    if (currentIdx < exercises.length - 1) {
      setCurrentIdx((current) => current + 1);
      setCurrentSet(1);
      setLoadKg("");
      setTimer(restTimeDefault);
      setIsResting(true);
      return;
    }

    setIsFinished(true);
  }

  async function handleOpenAlternatives() {
    if (!activeExercise) return;

    setAlternativesOpen(true);
    setAlternativesLoading(true);

    try {
      const response = await onRequestSubstitutes(activeExercise.id);
      setAlternatives(response ?? activeExercise.alternatives ?? []);
    } finally {
      setAlternativesLoading(false);
    }
  }

  if (!activeExercise) {
    return <div className="workout-player-empty">Nenhum exercicio carregado.</div>;
  }

  if (isFinished) {
    return (
      <div className="workout-player workout-player-finished">
        <div className="player-finished-icon">
          <Check size={34} />
        </div>
        <h2>Treino concluido.</h2>
        <p>As series do bloco de hoje foram finalizadas.</p>
        <button className="outline-button" onClick={() => {
          setCurrentIdx(0);
          setCurrentSet(1);
          setTimer(0);
          setIsResting(false);
          setIsFinished(false);
        }}>
          <RefreshCw size={18} />
          Reiniciar bloco
        </button>
      </div>
    );
  }

  return (
    <div className="workout-player">
      <div className="player-video">
        {activeExercise.videoUrl ? (
          <video src={activeExercise.videoUrl} autoPlay loop muted playsInline />
        ) : (
          <div className="player-video-placeholder">
            <Dumbbell size={42} />
          </div>
        )}
        <span>Exercicio {progressLabel}</span>
      </div>

      <div className="player-main">
        <h2>{activeExercise.title}</h2>
        <p>
          Serie {currentSet}/{activeExercise.sets} - {activeExercise.repsRange} repeticoes
        </p>

        {isResting ? (
          <div className="rest-timer active" aria-live="polite">
            <span>Descanso</span>
            <strong>{timer}s</strong>
          </div>
        ) : (
          <div className="rest-timer">
            <Timer size={24} />
            <span>Em execucao</span>
          </div>
        )}
      </div>

      <div className="player-actions">
        <div className="player-input-row">
          <label>
            Carga
            <input
              type="number"
              min="0"
              inputMode="decimal"
              placeholder="kg"
              value={loadKg}
              onChange={(event) => setLoadKg(event.target.value)}
            />
          </label>
          <button className="outline-button" onClick={handleOpenAlternatives}>
            Substituir aparelho
          </button>
        </div>

        <button className="primary-button player-complete-button" onClick={handleCompleteSet} disabled={isResting}>
          {isResting ? "Aguarde o descanso" : `Concluir serie ${currentSet}`}
        </button>
      </div>

      {alternativesOpen && (
        <div className="player-modal-backdrop" role="presentation" onClick={() => setAlternativesOpen(false)}>
          <div className="player-modal" role="dialog" aria-modal="true" aria-label="Alternativas de exercicio" onClick={(event) => event.stopPropagation()}>
            <div className="panel-title">
              <h2>Alternativas</h2>
              <span>{visibleAlternatives.length}</span>
            </div>
            {alternativesLoading ? (
              <div className="task-row">
                <RefreshCw className="spin" size={18} />
                Carregando substituicoes
              </div>
            ) : visibleAlternatives.length > 0 ? (
              visibleAlternatives.map((alternative) => (
                <div className="task-row" key={alternative.id}>
                  <Dumbbell size={18} />
                  {alternative.title}
                </div>
              ))
            ) : (
              <div className="task-row">
                <Dumbbell size={18} />
                Nenhuma alternativa cadastrada.
              </div>
            )}
            <button className="outline-button" onClick={() => setAlternativesOpen(false)}>
              Fechar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
