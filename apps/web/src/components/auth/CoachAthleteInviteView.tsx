import { Loader2 } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
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
    void apiGet<InvitePreview>(
      `/public/coach-athlete-invite?token=${encodeURIComponent(token)}`
    )
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

    if (!acceptTerms || !acceptPrivacy) {
      setError("Aceite os termos e a política de privacidade.");
      setSubmitting(false);
      return;
    }

    try {
      const response = await apiPost<{ token: string; user: { id: string; name: string; email: string; role: string } }>(
        "/auth/register-coach-athlete",
        {
          inviteToken: token,
          name,
          email: email || undefined,
          phone: phone || undefined,
          password,
          acceptTerms: true,
          acceptPrivacy: true
        }
      );
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
      <div className="login-form login-form--command grid min-h-[240px] place-items-center">
        <Loader2 className="spin text-brand-gold" size={28} />
      </div>
    );
  }

  if (previewError || !preview) {
    return (
      <div className="login-form login-form--command">
        <p className="ui-error login-feedback">{previewError ?? "Convite inválido."}</p>
        <Link to={paths.login} className="mt-4 inline-block text-sm font-bold text-brand-gold no-underline">
          Ir para entrar
        </Link>
      </div>
    );
  }

  return (
    <form className="login-form login-form--command" onSubmit={(e) => void handleSubmit(e)}>
      <p className="login-form-lead text-sm text-sand-muted">
        Você foi convidado por <strong className="text-sand">{preview.coachName}</strong> (
        {preview.organizationName} · {preview.unitName}). Crie sua conta para receber treinos exclusivos do seu coach.
      </p>
      <label>
        Nome completo
        <input className="admin-input" name="name" required minLength={2} autoComplete="name" />
      </label>
      <label>
        E-mail
        <input className="admin-input" type="email" name="email" autoComplete="email" placeholder="Opcional se usar telefone" />
      </label>
      <label>
        Telefone
        <input className="admin-input" name="phone" autoComplete="tel" placeholder="Opcional se usar e-mail" />
      </label>
      <label>
        Senha
        <input className="admin-input" type="password" name="password" required minLength={6} autoComplete="new-password" />
      </label>
      <label className="login-consent-row">
        <input type="checkbox" name="acceptTerms" required />
        <span>
          Li e aceito os{" "}
          <Link to={paths.terms} target="_blank" rel="noreferrer">
            Termos de Uso
          </Link>{" "}
          da {brand.name}
        </span>
      </label>
      <label className="login-consent-row">
        <input type="checkbox" name="acceptPrivacy" required />
        <span>
          Li e aceito a{" "}
          <Link to={paths.privacy} target="_blank" rel="noreferrer">
            Política de Privacidade
          </Link>
        </span>
      </label>
      {error ? <div className="ui-error login-feedback">{error}</div> : null}
      <button type="submit" className="ui-btn-primary w-full" disabled={submitting}>
        {submitting ? <Loader2 className="spin" size={18} /> : "Criar conta e entrar"}
      </button>
    </form>
  );
}
