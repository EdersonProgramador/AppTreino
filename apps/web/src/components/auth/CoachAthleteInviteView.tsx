import { Loader2, UserPlus } from "lucide-react";
import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { apiGet, apiPost } from "../../api";
import { paths } from "../../auth/paths";
import { fetchStudentPortalAccess } from "../../lib/student-portal-access";
import { useAuthStore } from "../../stores/authStore";
import { brand } from "../../lib/brand";

type InvitePreview = {
  ok: true;
  coachName: string;
  organizationName: string;
  unitName: string;
};

function InvitePanelShell({ children }: { children: ReactNode }) {
  return <section className="activate-funnel-panel login-command-panel">{children}</section>;
}

export function CoachAthleteInviteView() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token")?.trim() ?? "";
  const navigate = useNavigate();
  const [preview, setPreview] = useState<InvitePreview | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(Boolean(token));
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) {
      setPreviewError("Link de convite inválido.");
      setLoadingPreview(false);
      return;
    }
    let cancelled = false;
    void apiGet<InvitePreview>(`/public/coach-athlete-invite?token=${encodeURIComponent(token)}`)
      .then((data) => {
        if (cancelled) return;
        if (!data?.ok) {
          setPreviewError("Convite inválido.");
          return;
        }
        setPreview(data);
      })
      .catch((err) => {
        if (!cancelled) {
          setPreviewError(err instanceof Error ? err.message : "Convite indisponível.");
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingPreview(false);
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!token) return;
    setSubmitting(true);
    setError(null);
    const form = new FormData(event.currentTarget);
    const name = String(form.get("name") ?? "").trim();
    const email = String(form.get("email") ?? "").trim();
    const phone = String(form.get("phone") ?? "").trim();
    const password = String(form.get("password") ?? "");
    const acceptTerms = form.get("acceptTerms") === "on";
    const acceptPrivacy = form.get("acceptPrivacy") === "on";

    if (!email && !phone) {
      setError("Informe e-mail ou telefone para criar sua conta.");
      setSubmitting(false);
      return;
    }

    if (!acceptTerms || !acceptPrivacy) {
      setError("Aceite os termos e a política de privacidade.");
      setSubmitting(false);
      return;
    }

    try {
      const response = await apiPost<{
        token: string;
        user: { id: string; name: string; email: string; role: string };
      }>("/auth/register-coach-athlete", {
        inviteToken: token,
        name,
        email: email || undefined,
        phone: phone || undefined,
        password,
        acceptTerms: true,
        acceptPrivacy: true
      });
      const store = useAuthStore.getState();
      store.beginSignIn();
      let destination = store.establishSession(response);
      try {
        const access = await fetchStudentPortalAccess(response.token);
        if (access.hasAccess) destination = paths.student;
      } catch {
        destination = paths.student;
      }
      store.beginRedirect(destination);
      navigate(destination, { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível criar a conta.");
    } finally {
      setSubmitting(false);
    }
  };

  if (loadingPreview) {
    return (
      <InvitePanelShell>
        <div className="login-form login-form--command grid min-h-[280px] place-items-center">
          <Loader2 className="animate-spin text-brand-gold" size={28} aria-label="Carregando convite" />
        </div>
      </InvitePanelShell>
    );
  }

  if (previewError || !preview) {
    return (
      <InvitePanelShell>
        <header className="login-command-panel__head">
          <span className="home-telemetry-label">Convite</span>
          <h2 className="login-command-panel__title">Link indisponível</h2>
        </header>
        <p className="ui-error login-feedback">{previewError ?? "Convite inválido."}</p>
        <Link to={paths.login} className="login-command-panel__activate-link no-underline">
          Ir para entrar
        </Link>
      </InvitePanelShell>
    );
  }

  return (
    <InvitePanelShell>
      <header className="login-command-panel__head">
        <span className="home-telemetry-label">{preview.organizationName}</span>
        <h2 className="login-command-panel__title">Conta de aluno</h2>
        <p className="login-command-panel__copy">
          Convite de <strong>{preview.coachName}</strong> · {preview.unitName}. Use e-mail ou telefone e defina uma
          senha para acessar treinos exclusivos do seu coach.
        </p>
      </header>

      <form className="login-form login-form--command" onSubmit={(e) => void handleSubmit(e)}>
        <label className="ui-label login-field">
          <span className="login-field-caption">Nome completo</span>
          <input
            className="ui-input"
            name="name"
            required
            minLength={2}
            autoComplete="name"
            placeholder="Como aparece no perfil"
          />
        </label>

        <div className="login-form-row-split">
          <label className="ui-label login-field">
            <span className="login-field-caption">E-mail</span>
            <input
              className="ui-input"
              type="email"
              name="email"
              autoComplete="email"
              placeholder="seu@email.com"
            />
          </label>
          <label className="ui-label login-field">
            <span className="login-field-caption">Telefone</span>
            <input className="ui-input" name="phone" type="tel" autoComplete="tel" placeholder="(00) 00000-0000" />
          </label>
        </div>
        <p className="login-field-hint">Informe e-mail ou telefone (pelo menos um).</p>

        <label className="ui-label login-field">
          <span className="login-field-caption">Senha</span>
          <input
            className="ui-input"
            type="password"
            name="password"
            required
            minLength={6}
            autoComplete="new-password"
            placeholder="Mínimo 6 caracteres"
          />
        </label>

        <div className="login-consent-block">
          <span className="login-consent-block__title">Consentimento (LGPD)</span>
          <label className="login-consent-row">
            <input type="checkbox" name="acceptTerms" required />
            <span>
              Li e aceito os{" "}
              <Link to={paths.terms} target="_blank" rel="noreferrer">
                Termos de Uso
              </Link>{" "}
              da {brand.name}.
            </span>
          </label>
          <label className="login-consent-row">
            <input type="checkbox" name="acceptPrivacy" required />
            <span>
              Li e aceito a{" "}
              <Link to={paths.privacy} target="_blank" rel="noreferrer">
                Política de Privacidade
              </Link>
              .
            </span>
          </label>
        </div>

        {error ? <div className="ui-error login-feedback">{error}</div> : null}

        <button
          type="submit"
          className={`ui-btn-primary login-submit-button${submitting ? " is-loading" : ""}`}
          disabled={submitting}
        >
          {submitting ? <Loader2 className="animate-spin" size={18} /> : <UserPlus size={18} />}
          <span>Criar conta e entrar</span>
        </button>

        <p className="login-command-panel__activate">
          Já tem conta?{" "}
          <Link className="login-command-panel__activate-link" to={paths.login}>
            Entrar
          </Link>
        </p>
      </form>
    </InvitePanelShell>
  );
}
