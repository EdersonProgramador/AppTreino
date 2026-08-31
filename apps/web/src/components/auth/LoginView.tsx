import {
  ArrowLeft,
  Loader2,
  LogIn,
  Play,
  UserRound
} from "lucide-react";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { formatPriceInBRL } from "@app-treino/shared";
import { apiGet } from "../../api";
import { WorkoutOnboarding, type WorkoutOnboardingSubmitPayload } from "../onboarding/WorkoutOnboarding";
import type { AuthMode, PlanCode } from "../../types/auth";
import { googleClientId } from "../../lib/urls";
import { uiSounds } from "../../lib/ui-sounds";

export const LoginView = ({
  loading,
  error,
  success,
  selectedPlanCode,
  resetToken,
  preferRegister = false,
  onSubmit,
  onRegisterOnboarding,
  onForgotPassword,
  onResetPassword,
  onClearResetToken
}: {
  loading: "idle" | "submitting";
  error: string | null;
  success: string | null;
  selectedPlanCode: PlanCode | null;
  resetToken: string | null;
  preferRegister?: boolean;
  onSubmit: (mode: AuthMode, formData: FormData, provider?: "EMAIL" | "GOOGLE") => Promise<void>;
  onRegisterOnboarding: (payload: WorkoutOnboardingSubmitPayload) => Promise<void>;
  onForgotPassword: (formData: FormData) => Promise<void>;
  onResetPassword: (formData: FormData) => Promise<void>;
  onClearResetToken: () => void;
}) => {
  const [mode, setMode] = useState<AuthMode>(
    resetToken ? "reset" : Boolean(selectedPlanCode) || preferRegister ? "register" : "login"
  );
  const formRef = useRef<HTMLFormElement | null>(null);
  const googleButtonRef = useRef<HTMLDivElement | null>(null);
  const [catalogPlans, setCatalogPlans] = useState<Array<{ code: string; name: string; priceInCents: number }>>([]);
  const selectedPlan = catalogPlans.find((plan) => plan.code === selectedPlanCode) ?? null;

  useEffect(() => {
    void apiGet<{ plans: Array<{ code: string; name: string; priceInCents: number }> }>("/plans")
      .then((response) => setCatalogPlans(response.plans ?? []))
      .catch(() => setCatalogPlans([]));
  }, []);

  useEffect(() => {
    if (selectedPlanCode || preferRegister) setMode("register");
  }, [selectedPlanCode, preferRegister]);

  useEffect(() => {
    if (resetToken) setMode("reset");
  }, [resetToken]);

  useEffect(() => {
    if (success && mode === "reset") setMode("login");
  }, [success, mode]);

  useEffect(() => {
    if (!googleClientId || !googleButtonRef.current || mode === "forgot" || mode === "reset") return;

    const container = googleButtonRef.current;
    let cancelled = false;

    const renderGoogleButton = () => {
      if (cancelled || !window.google || !container || !googleClientId) return;

      const available = Math.floor(container.getBoundingClientRect().width || 0);
      const width = Math.min(320, Math.max(240, available > 0 ? available : 280));

      container.innerHTML = "";
      window.google.accounts.id.initialize({
        client_id: googleClientId,
        callback: (response) => {
          if (!response.credential || !formRef.current) return;
          const data = new FormData(formRef.current);
          data.set("idToken", response.credential);
          data.set("credential", response.credential);
          void onSubmit(mode, data, "GOOGLE");
        }
      });
      window.google.accounts.id.renderButton(container, {
        theme: "outline",
        size: "large",
        type: "standard",
        text: mode === "login" ? "signin_with" : "signup_with",
        shape: "rectangular",
        width
      });
    };

    if (window.google) {
      renderGoogleButton();
      return () => {
        cancelled = true;
      };
    }

    const existingScript = document.querySelector<HTMLScriptElement>("script[data-google-identity]");
    if (existingScript) {
      existingScript.addEventListener("load", renderGoogleButton, { once: true });
      return () => {
        cancelled = true;
        existingScript.removeEventListener("load", renderGoogleButton);
      };
    }

    const script = document.createElement("script");
    script.src = "https://accounts.google.com/gsi/client";
    script.async = true;
    script.defer = true;
    script.dataset.googleIdentity = "true";
    script.addEventListener("load", renderGoogleButton, { once: true });
    document.head.appendChild(script);

    return () => {
      cancelled = true;
      script.removeEventListener("load", renderGoogleButton);
    };
  }, [mode, onSubmit]);

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    uiSounds.submit();

    if (mode === "forgot") {
      void onForgotPassword(new FormData(event.currentTarget));
      return;
    }

    if (mode === "reset") {
      void onResetPassword(new FormData(event.currentTarget));
      return;
    }

    void onSubmit(mode, new FormData(event.currentTarget), "EMAIL");
  };

  function handleGoogleSubmit() {
    if (!formRef.current) return;
    void onSubmit(mode === "register" ? "register" : "login", new FormData(formRef.current), "GOOGLE");
  }

  const isSubmitting = loading !== "idle";
  const title =
    mode === "reset"
      ? "Redefinir senha"
      : mode === "forgot"
        ? "Recuperar acesso"
        : mode === "register"
          ? "Criar conta"
          : "Entrar";
  const description =
    mode === "reset"
      ? "Defina uma nova senha para acessar sua conta."
      : mode === "forgot"
        ? "Informe o e-mail ou telefone cadastrado para receber o link."
        : mode === "register"
          ? "Conte seu objetivo e disponibilidade para liberar os treinos certos."
          : "Acesse com e-mail, telefone ou Google.";

  return (
    <main className="login-page">
      <section className="ui-panel login-panel">
        <header className="login-panel-header">
          <div className="login-panel-icon" aria-hidden="true">
            <Play size={20} />
          </div>
          <span className="ui-eyebrow">Área de acesso</span>
          <h1 className="ui-display login-panel-title">{title}</h1>
          <p className="login-panel-copy">{description}</p>
        </header>

        {(mode === "login" || mode === "register") && (
          <div className="login-mode-tabs" role="tablist" aria-label="Modo de acesso">
            <button
              type="button"
              className={`login-mode-tab${mode === "login" ? " is-active" : ""}`}
              onClick={() => setMode("login")}
              role="tab"
              aria-selected={mode === "login"}
            >
              Login
            </button>
            <button
              type="button"
              className={`login-mode-tab${mode === "register" ? " is-active" : ""}`}
              onClick={() => setMode("register")}
              role="tab"
              aria-selected={mode === "register"}
            >
              Cadastro
            </button>
          </div>
        )}

        {mode === "register" ? (
          <div className="login-register-wrap">
            <WorkoutOnboarding
              mode="register"
              submitting={isSubmitting}
              error={error}
              selectedPlanName={
                selectedPlan ? `${selectedPlan.name} - ${formatPriceInBRL(selectedPlan.priceInCents)}` : null
              }
              onSubmit={onRegisterOnboarding}
            />
          </div>
        ) : (
          <form ref={formRef} className="login-form" onSubmit={handleSubmit}>
            {(mode === "login" || mode === "forgot") && (
              <label className="ui-label login-field">
                <span className="login-field-caption">E-mail ou telefone</span>
                <input
                  className="ui-input"
                  name="identifier"
                  type="text"
                  inputMode="email"
                  autoComplete="username"
                  placeholder="Seu e-mail ou telefone"
                  required
                />
              </label>
            )}

            {mode === "reset" && (
              <>
                <label className="ui-label login-field">
                  <span className="login-field-caption">Nova senha</span>
                  <input
                    className="ui-input"
                    name="password"
                    type="password"
                    autoComplete="new-password"
                    minLength={6}
                    placeholder="Mínimo 6 caracteres"
                    required
                  />
                </label>
                <label className="ui-label login-field">
                  <span className="login-field-caption">Confirmar nova senha</span>
                  <input
                    className="ui-input"
                    name="confirmPassword"
                    type="password"
                    autoComplete="new-password"
                    minLength={6}
                    placeholder="Repita a nova senha"
                    required
                  />
                </label>
              </>
            )}

            {mode === "login" && (
              <label className="ui-label login-field">
                <span className="login-field-caption">Senha</span>
                <input
                  className="ui-input"
                  name="password"
                  type="password"
                  autoComplete="current-password"
                  minLength={6}
                  placeholder="Mínimo 6 caracteres"
                  required
                />
              </label>
            )}

            {error ? <div className="ui-error login-feedback">{error}</div> : null}
            {success ? <div className="ui-success login-feedback">{success}</div> : null}

            <button
              className={`ui-btn-primary login-submit-button${isSubmitting ? " is-loading" : ""}`}
              type="submit"
              disabled={isSubmitting}
            >
              {loading === "submitting" ? <Loader2 className="animate-spin" size={18} /> : <LogIn size={18} />}
              <span>
                {mode === "reset"
                  ? "Salvar nova senha"
                  : mode === "forgot"
                    ? "Enviar link de recuperação"
                    : "Entrar"}
              </span>
            </button>

            {mode === "login" && (
              <>
                <div className="login-divider" role="separator" aria-label="ou">
                  <span>ou</span>
                </div>
                {googleClientId ? (
                  <div className="google-identity-button" ref={googleButtonRef} />
                ) : (
                  <button
                    className="ui-btn-secondary login-google-fallback"
                    type="button"
                    onClick={handleGoogleSubmit}
                    disabled={isSubmitting}
                  >
                    {loading === "submitting" ? <Loader2 className="animate-spin" size={18} /> : <UserRound size={18} />}
                    Entrar com Google
                  </button>
                )}
                <button className="ui-btn-ghost login-forgot" type="button" onClick={() => setMode("forgot")}>
                  Esqueci minha senha
                </button>
              </>
            )}

            {(mode === "forgot" || mode === "reset") && (
              <button
                className="ui-btn-ghost login-forgot"
                type="button"
                onClick={() => {
                  onClearResetToken();
                  setMode("login");
                }}
              >
                <ArrowLeft size={16} />
                Voltar para o login
              </button>
            )}
          </form>
        )}
      </section>
    </main>
  );
};
