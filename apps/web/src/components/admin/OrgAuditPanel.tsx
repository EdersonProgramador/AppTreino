import { Clock3, ScrollText } from "lucide-react";
import { dataRowClass } from "../../lib/admin-cms-classes";

type AuditLog = {
  id: string;
  action: string;
  resourceType: string;
  createdAt: string;
  user: { id: string; name: string; email: string | null } | null;
};

const ACTION_LABELS: Record<string, string> = {
  "organization.create": "Organização criada",
  "organization.update": "Organização atualizada",
  "organization.delete": "Organização removida",
  "unit.create": "Unidade criada",
  "unit.update": "Unidade atualizada",
  "organization_member.upsert": "Membro da equipe atualizado",
  "athlete_link.upsert": "Aluno vinculado à unidade"
};

function formatAuditAction(action: string) {
  return ACTION_LABELS[action] ?? action.replaceAll(".", " · ");
}

export function OrgAuditPanel({ logs }: { logs: AuditLog[] }) {
  return (
    <aside className="org-audit-panel org-estrutura-sidebar">
      <header className="org-audit-panel__header">
        <ScrollText size={18} />
        <div>
          <h2>Auditoria recente</h2>
          <p>Últimas ações nesta organização</p>
        </div>
      </header>
      {logs.length === 0 ? (
        <p className="org-audit-panel__empty">Sem registros para esta organização.</p>
      ) : (
        <ul className="org-audit-panel__list">
          {logs.map((log) => (
            <li key={log.id} className={dataRowClass}>
              <strong>{formatAuditAction(log.action)}</strong>
              <span className="org-audit-panel__meta">
                <Clock3 size={12} />
                {new Date(log.createdAt).toLocaleString("pt-BR")}
                {" · "}
                {log.user?.name ?? "Sistema"}
              </span>
            </li>
          ))}
        </ul>
      )}
    </aside>
  );
}
