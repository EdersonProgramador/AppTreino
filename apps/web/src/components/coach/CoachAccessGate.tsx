import { Link } from "react-router-dom";
import { Loader2, RefreshCw, ShieldCheck } from "lucide-react";
import { brand } from "../../lib/brand";
import { assetUrl } from "../../lib/urls";
import { paths } from "../../auth/paths";
import type { StaffSummary } from "../../lib/staff-summary";

type Props = {
  userName: string;
  staffSummary: StaffSummary;
  staffLoading: boolean;
  workspaceLoading: boolean;
  onRetry: () => void;
  onLogout: () => void;
};

export function CoachAccessGate({
  userName,
  staffSummary,
  staffLoading,
  workspaceLoading,
  onRetry,
  onLogout
}: Props) {
  const retrying = staffLoading || workspaceLoading;

  return (
    <div className="coach-access-gate ui-shell">
      <div className="coach-access-gate__card">
        <img src={assetUrl("assets/atlly-logo.png")} alt={brand.name} className="coach-access-gate__logo" />
        <span className="coach-access-gate__eyebrow">Painel profissional</span>
        <h1>Olá, {userName.split(" ")[0] || userName}</h1>

        {staffSummary.isCoach && !staffSummary.isStaff ? (
          <p className="coach-access-gate__lead">
            Detectamos vínculo de coach, mas o workspace ainda não sincronizou. Isso é comum logo após a promoção.
          </p>
        ) : staffSummary.isCoach ? (
          <p className="coach-access-gate__lead">
            Seu papel de coach está ativo, mas o painel não carregou completamente. Tente atualizar o acesso.
          </p>
        ) : (
          <p className="coach-access-gate__lead">
            Sua conta ainda não está vinculada como coach, nutricionista ou admin de uma organização ATLLY.
          </p>
        )}

        <ul className="coach-access-gate__checks">
          <li className={staffSummary.isCoach ? "is-ok" : ""}>
            <ShieldCheck size={16} />
            Papel COACH na organização
          </li>
          <li className={staffSummary.isStaff ? "is-ok" : ""}>
            <ShieldCheck size={16} />
            Equipe ativa no workspace
          </li>
          <li className={staffSummary.hasActiveSubscription ? "is-ok" : ""}>
            <ShieldCheck size={16} />
            Assinatura ATLLY {staffSummary.hasActiveSubscription ? "ativa" : "(comissão exige matrícula)"}
          </li>
        </ul>

        {!staffSummary.isStaff && !staffSummary.isCoach ? (
          <p className="coach-access-gate__hint">
            Peça ao administrador para promover você em <strong>Alunos &amp; coaches</strong> ou em{" "}
            <strong>Organizações → Equipe</strong>. Depois volte aqui e clique em atualizar.
          </p>
        ) : null}

        <div className="coach-access-gate__actions">
          <button type="button" className="admin-primary-button" disabled={retrying} onClick={() => void onRetry()}>
            {retrying ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}
            {retrying ? "Verificando acesso…" : "Atualizar acesso"}
          </button>
          <Link className="admin-secondary-button no-underline" to={paths.student}>
            Voltar para área do aluno
          </Link>
          <button type="button" className="admin-secondary-button" onClick={onLogout}>
            Sair
          </button>
        </div>
      </div>
    </div>
  );
}
