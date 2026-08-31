import { useCallback, useEffect, useState } from "react";
import { Building2, ClipboardList, Loader2, RefreshCw, UsersRound, Utensils } from "lucide-react";
import { apiGet } from "../../api";

type OrgUser = { id: string; name: string; email: string | null };

type OrgResources = {
  links: Array<{
    id: string;
    status: string;
    organization: { id: string; name: string; type?: string };
    unit: { id: string; name: string; city?: string | null; state?: string | null };
  }>;
  assignments: Array<{
    id: string;
    professionalType: string;
    professional: OrgUser;
    modality: { id: string; name: string } | null;
  }>;
  classMembers: Array<{
    id: string;
    class: {
      id: string;
      name: string;
      description: string | null;
      coach: OrgUser;
      modality: { id: string; name: string } | null;
      organization: { id: string; name: string };
      unit: { id: string; name: string };
    };
  }>;
  nutritionAssignments: Array<{
    id: string;
    startDate: string;
    endDate: string | null;
    nutritionPlan: {
      id: string;
      title: string;
      description: string | null;
      status: string;
      nutritionist: OrgUser;
      organization: { id: string; name: string };
      unit: { id: string; name: string };
    };
  }>;
};

type Props = {
  token: string;
  athleteId: string;
};

export function StudentOrgSection({ token, athleteId }: Props) {
  const [data, setData] = useState<OrgResources | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await apiGet<OrgResources>(`/org/athletes/${athleteId}/org-resources`, token);
      setData(response);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível carregar sua organização.");
    } finally {
      setLoading(false);
    }
  }, [athleteId, token]);

  useEffect(() => {
    void load();
  }, [load]);

  const empty =
    !data?.links.length &&
    !data?.classMembers.length &&
    !data?.nutritionAssignments.length &&
    !data?.assignments.length;

  return (
    <section className="admin-grid">
      <article className="table-panel wide-panel">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <span className="eyebrow w-fit">Organização</span>
            <h2 className="m-0 flex items-center gap-2 text-2xl font-bold text-sand">
              <Building2 size={22} /> Minha org
            </h2>
            <p className="m-0 text-sm text-sand-muted">
              Vínculos, turmas, profissionais e planos nutricionais da sua academia/box.
            </p>
          </div>
          <button type="button" className="admin-secondary-button" onClick={() => void load()} disabled={loading}>
            {loading ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}
            Atualizar
          </button>
        </div>

        {error && <p className="mt-4 text-sm text-red-400">{error}</p>}

        {loading && !data ? (
          <p className="mt-6 flex items-center gap-2 text-sm text-sand-muted">
            <Loader2 size={16} className="animate-spin" /> Carregando...
          </p>
        ) : empty ? (
          <p className="mt-6 text-sm text-sand-muted">
            Você ainda não está vinculado a nenhuma organização. Quando o admin/coach te adicionar, turmas e nutrição
            aparecem aqui.
          </p>
        ) : (
          <div className="mt-6 grid gap-6 lg:grid-cols-2">
            <div className="rounded-3xl border border-[color:var(--app-border)] bg-[var(--app-elev)] p-4">
              <h3 className="mb-3 flex items-center gap-2 text-lg font-bold">
                <Building2 size={18} /> Vínculos
              </h3>
              {!data?.links.length ? (
                <p className="text-sm text-sand-muted">Sem vínculos ativos.</p>
              ) : (
                <ul className="grid gap-2 text-sm">
                  {data.links.map((link) => (
                    <li key={link.id} className="rounded-2xl border border-[color:var(--app-border)] px-3 py-2">
                      <strong>{link.organization.name}</strong>
                      <span className="block text-xs text-sand-muted">
                        {link.unit.name}
                        {link.unit.city ? ` · ${link.unit.city}/${link.unit.state ?? ""}` : ""} · {link.status}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="rounded-3xl border border-[color:var(--app-border)] bg-[var(--app-elev)] p-4">
              <h3 className="mb-3 flex items-center gap-2 text-lg font-bold">
                <UsersRound size={18} /> Profissionais
              </h3>
              {!data?.assignments.length ? (
                <p className="text-sm text-sand-muted">Nenhum coach/nutri atribuído.</p>
              ) : (
                <ul className="grid gap-2 text-sm">
                  {data.assignments.map((item) => (
                    <li key={item.id} className="rounded-2xl border border-[color:var(--app-border)] px-3 py-2">
                      <strong>{item.professional.name}</strong>
                      <span className="block text-xs text-sand-muted">
                        {item.professionalType}
                        {item.modality ? ` · ${item.modality.name}` : ""}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="rounded-3xl border border-[color:var(--app-border)] bg-[var(--app-elev)] p-4">
              <h3 className="mb-3 flex items-center gap-2 text-lg font-bold">
                <ClipboardList size={18} /> Turmas
              </h3>
              {!data?.classMembers.length ? (
                <p className="text-sm text-sand-muted">Você ainda não está em nenhuma turma.</p>
              ) : (
                <ul className="grid gap-2 text-sm">
                  {data.classMembers.map((item) => (
                    <li key={item.id} className="rounded-2xl border border-[color:var(--app-border)] px-3 py-2">
                      <strong>{item.class.name}</strong>
                      <span className="block text-xs text-sand-muted">
                        {item.class.organization.name} · {item.class.unit.name} · Coach: {item.class.coach.name}
                        {item.class.modality ? ` · ${item.class.modality.name}` : ""}
                      </span>
                      {item.class.description && (
                        <p className="mt-2 whitespace-pre-wrap text-xs text-sand-muted">{item.class.description}</p>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="rounded-3xl border border-[color:var(--app-border)] bg-[var(--app-elev)] p-4 lg:col-span-2">
              <h3 className="mb-3 flex items-center gap-2 text-lg font-bold">
                <Utensils size={18} /> Nutrição
              </h3>
              {!data?.nutritionAssignments.length ? (
                <p className="text-sm text-sand-muted">Nenhum plano nutricional atribuído.</p>
              ) : (
                <ul className="grid gap-3 text-sm">
                  {data.nutritionAssignments.map((item) => (
                    <li key={item.id} className="rounded-2xl border border-[color:var(--app-border)] px-4 py-3">
                      <strong>{item.nutritionPlan.title}</strong>
                      <span className="block text-xs text-sand-muted">
                        {item.nutritionPlan.organization.name} · Nutri: {item.nutritionPlan.nutritionist.name} ·{" "}
                        {item.nutritionPlan.status}
                      </span>
                      {item.nutritionPlan.description ? (
                        <p className="mt-3 whitespace-pre-wrap text-sand-muted">{item.nutritionPlan.description}</p>
                      ) : (
                        <p className="mt-3 text-xs text-sand-muted">Plano sem conteúdo detalhado ainda.</p>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}
      </article>
    </section>
  );
}
