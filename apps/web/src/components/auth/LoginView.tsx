import {
  Loader2,
  LogIn,
  Play,
  UserRound
} from "lucide-react";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { formatPriceInBRL, initialPlans } from "@app-treino/shared";
import { WorkoutOnboarding, type WorkoutOnboardingSubmitPayload } from "../onboarding/WorkoutOnboarding";
import type { AuthMode, PlanCode } from "../../types/auth";
import { googleClientId } from "../../lib/urls";

export function LoginView({
  loading,
  error,
  success,
  selectedPlanCode,
  resetToken,
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
  onSubmit: (mode: AuthMode, formData: FormData, provider?: "EMAIL" | "GOOGLE") => Promise<void>;
  onRegisterOnboarding: (payload: WorkoutOnboardingSubmitPayload) => Promise<void>;
  onForgotPassword: (formData: FormData) => Promise<void>;
  onResetPassword: (formData: FormData) => Promise<void>;
  onClearResetToken: () => void;
}) {
  const [mode, setMode] = useState<AuthMode>(resetToken ? "reset" : selectedPlanCode ? "register" : "login");
  const formRef = useRef<HTMLFormElement | null>(null);
  const googleButtonRef = useRef<HTMLDivElement | null>(null);
  const selectedPlan = initialPlans.find((plan) => plan.code === selectedPlanCode);

  useEffect(() => {
    if (selectedPlanCode) {
      setMode("register");
    }
  }, [selectedPlanCode]);

  useEffect(() => {
    if (resetToken) {
      setMode("reset");
    }
  }, [resetToken]);

  useEffect(() => {
    if (success && mode === "reset") {
      setMode("login");
    }
  }, [success, mode]);

  useEffect(() => {
    if (!googleClientId || !googleButtonRef.current || mode === "forgot" || mode === "reset") return;

    const renderGoogleButton = () => {
      if (!window.google || !googleButtonRef.current || !googleClientId) return;

      googleButtonRef.current.innerHTML = "";
      window.google.accounts.id.initialize({
        client_id: googleClientId,
        callback: (response) => {
          if (!response.credential || !formRef.current) {
            return;
          }

          const data = new FormData(formRef.current);
          data.set("idToken", response.credential);
          data.set("credential", response.credential);
          void onSubmit(mode, data, "GOOGLE");
        }
      });
      window.google.accounts.id.renderButton(googleButtonRef.current, {
        theme: "outline",
        size: "large",
        type: "standard",
        text: mode === "login" ? "signin_with" : "signup_with",
        shape: "rectangular",
        width: 320
      });
    };

    if (window.google) {
      renderGoogleButton();
      return;
    }

    const existingScript = document.querySelector<HTMLScriptElement>("script[data-google-identity]");

    if (existingScript) {
      existingScript.addEventListener("load", renderGoogleButton, { once: true });
      return () => existingScript.removeEventListener("load", renderGoogleButton);
    }

    const script = document.createElement("script");
    script.src = "https://accounts.google.com/gsi/client";
    script.async = true;
    script.defer = true;
    script.dataset.googleIdentity = "true";
    script.addEventListener("load", renderGoogleButton, { once: true });
    document.head.appendChild(script);

    return () => script.removeEventListener("load", renderGoogleButton);
  }, [mode, onSubmit]);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (mode === "forgot") {
      void onForgotPassword(new FormData(event.currentTarget));
      return;
    }

    if (mode === "reset") {
      void onResetPassword(new FormData(event.currentTarget));
      return;
    }

    void onSubmit(mode, new FormData(event.currentTarget), "EMAIL");
  }

  function handleGoogleSubmit() {
    if (!formRef.current) return;
    void onSubmit(mode === "register" ? "register" : "login", new FormData(formRef.current), "GOOGLE");
  }

  function handleForgotPasswordClick() {
    setMode("forgot");
  }

  function handleBackToLogin() {
    onClearResetToken();
    setMode("login");
  }

  const isSubmitting = loading !== "idle";
  const title =
    mode === "reset"
      ? "Redefinir senha"
      : mode === "forgot"
        ? "Recuperar acesso"
        : mode === "register"
          ? "Cadastro personalizado"
          : "Entrar no App Treino";
  const description =
    mode === "reset"
      ? "Escolha uma nova senha para voltar a acessar sua conta."
      : mode === "forgot"
        ? "Informe o e-mail ou telefone cadastrado para receber o link de redefinição."
        : mode === "register"
          ? "Em poucos passos coletamos seu objetivo, nível e disponibilidade para liberar os treinos certos."
          : "Entre com e-mail, telefone ou Google para acessar sua área de aluno com o mesmo fluxo de autenticação.";

  return (
    <main className="flex min-h-[calc(100vh-76px)] items-center justify-center px-5 py-10 sm:px-8 md:px-12">
      <section className="ui-panel w-full max-w-lg">
        <div
          className="mb-5 inline-flex h-11 w-11 items-center justify-center rounded-xl border border-brand-gold/25 bg-brand-gold/10 text-brand-gold"
          aria-hidden="true"
        >
          <Play size={22} />
        </div>
        <span className="ui-eyebrow">Área de acesso</span>
        <h1 className="ui-display mt-3 text-[clamp(1.75rem,4vw,2.5rem)] leading-tight">{title}</h1>
        <p className="mt-3 text-base leading-relaxed text-sand-muted">{description}</p>

        {(mode === "login" || mode === "register") && (
          <div
            className="mt-6 grid grid-cols-2 gap-2 rounded-xl border border-white/10 bg-ink/50 p-1"
            role="tablist"
            aria-label="Modo de acesso"
          >
            <button
              className={`min-h-[42px] rounded-lg text-sm font-extrabold transition ${
                mode === "login" ? "bg-brand-gold text-ink" : "text-sand-muted hover:text-sand"
              }`}
              onClick={() => setMode("login")}
              role="tab"
              aria-selected={mode === "login"}
            >
              Login
            </button>
            <button
              className={`min-h-[42px] rounded-lg text-sm font-extrabold transition ${
                mode === "register" ? "bg-brand-gold text-ink" : "text-sand-muted hover:text-sand"
              }`}
              onClick={() => setMode("register")}
              role="tab"
              aria-selected={mode === "register"}
            >
              Cadastro
            </button>
          </div>
        )}

        {mode === "register" ? (
          <WorkoutOnboarding
            mode="register"
            submitting={isSubmitting}
            error={error}
            selectedPlanName={
              selectedPlan
                ? `${selectedPlan.name} - ${formatPriceInBRL(selectedPlan.priceInCents)}`
                : null
            }
            onSubmit={onRegisterOnboarding}
          />
        ) : (
          <form ref={formRef} className="mt-6 grid gap-4" onSubmit={handleSubmit}>
            {mode === "login" || mode === "forgot" ? (
              <label className="ui-label">
                E-mail ou telefone
                <input
                  className="ui-input"
                  name="identifier"
                  type="text"
                  placeholder="Seu e-mail ou telefone"
                  required
                />
              </label>
            ) : null}
            {mode === "reset" && (
              <>
                <label className="ui-label">
                  Nova senha
                  <input
                    className="ui-input"
                    name="password"
                    type="password"
                    minLength={6}
                    placeholder="Mínimo 6 caracteres"
                    required
                  />
                </label>
                <label className="ui-label">
                  Confirmar nova senha
                  <input
                    className="ui-input"
                    name="confirmPassword"
                    type="password"
                    minLength={6}
                    placeholder="Repita a nova senha"
                    required
                  />
                </label>
              </>
            )}
            {mode === "login" && (
              <label className="ui-label">
                Senha
                <input
                  className="ui-input"
                  name="password"
                  type="password"
                  minLength={6}
                  placeholder="Mínimo 6 caracteres"
                  required
                />
              </label>
            )}
            {mode === "login" &&
              (googleClientId ? (
                <div className="flex justify-center [&>div]:w-full [&>div>div]:w-full" ref={googleButtonRef} />
              ) : (
                <button className="ui-btn-secondary w-full" type="button" onClick={handleGoogleSubmit} disabled={isSubmitting}>
                  {loading === "submitting" ? <Loader2 className="animate-spin" size={18} /> : <UserRound size={18} />}
                  Entrar com Google
                </button>
              ))}
            <button
              className={`ui-btn-primary login-submit-button w-full${isSubmitting ? " is-loading" : ""}`}
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
              <button className="ui-btn-ghost w-full" type="button" onClick={handleForgotPasswordClick}>
                Esqueci minha senha
              </button>
            )}
            {(mode === "forgot" || mode === "reset") && (
              <button className="ui-btn-ghost w-full" type="button" onClick={handleBackToLogin}>
                Voltar para o login
              </button>
            )}
          </form>
        )}
        {mode !== "register" && error && <div className="ui-error">{error}</div>}
        {success && <div className="ui-success">{success}</div>}
      </section>
    </main>
  );
}
