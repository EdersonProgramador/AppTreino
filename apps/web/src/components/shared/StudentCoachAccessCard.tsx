import { Link } from "react-router-dom";
import { Loader2, RefreshCw, Sparkles } from "lucide-react";
import { paths } from "../../auth/paths";
import type { StaffSummary } from "../../lib/staff-summary";
import { CoachStaffBadge } from "./CoachStaffBadge";

type Props = {
  summary: StaffSummary;
  loading: boolean;
  error: string | null;
  onRefresh: () => void;
  compact?: boolean;
};

export function StudentCoachAccessCard({ summary, loading, error, onRefresh, compact = false }: Props) {
  const orgLabel = summary.organizations.map((org) => org.name).join(" · ");

  return (
    <div className={`student-coach-access-card${compact ? " is-compact" : ""}`}>
      <div className="student-coach-access-card__head">
        <span className="student-coach-access-card__icon" aria-hidden>
          <Sparkles size={18} />
        </span>
        <div>
          <div className="student-coach-access-card__title-row">
            <h3 className="student-coach-access-card__title">Painel profissional ATLLY</h3>
            {summary.isActiveCoach ? <CoachStaffBadge compact /> : null}
            {summary.isCoach && !summary.isActiveCoach ? (
              <span className="coach-staff-badge coach-staff-badge--staff coach-staff-badge--compact">Coach ATLLY</span>
            ) : null}
          </div>
          <p className="student-coach-access-card__subtitle">
            {summary.isStaff
              ? summary.isActiveCoach
                ? "Estúdio de treinos, turmas, alunos e comissão de indicação liberados."
                : summary.isCoach
                  ? "Seu painel /coach está liberado. Renove a assinatura ATLLY para comissão e selo ativo."
                  : "Gerencie alunos, turmas e conteúdo da sua organização."
              : "Integra equipe ATLLY ou foi promovido a coach? Abra o painel e use Atualizar acesso se acabou de receber o papel."}
          </p>
          {orgLabel ? <p className="student-coach-access-card__orgs">{orgLabel}</p> : null}
        </div>
      </div>

      {error ? <p className="student-coach-access-card__error">{error}</p> : null}

      <div className="student-coach-access-card__actions">
        <Link to={paths.coach} className="student-coach-access-card__primary no-underline">
          Abrir painel /coach
        </Link>
        <button type="button" className="student-coach-access-card__secondary" disabled={loading} onClick={() => void onRefresh()}>
          {loading ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}
          Atualizar acesso
        </button>
      </div>
    </div>
  );
}
