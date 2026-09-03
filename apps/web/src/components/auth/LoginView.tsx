import { ArrowLeft, Loader2, LogIn, Mail, Save, UserRound } from "lucide-react";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import type { AuthMode } from "../../types/auth";
import { googleClientId } from "../../lib/urls";
import { brand } from "../../lib/brand";
import { paths } from "../../auth/paths";
import { uiSounds } from "../../lib/ui-sounds";

export const LoginView = ({
  loading,
  error,
  success,
  resetToken,
  onSubmit,
  onForgotPassword,
  onResetPassword,
  onClearResetToken,
  onAccessModeChange,
  onClearMessages
}: {
  loading: "idle" | "submitting";
  error: string | null;
  success: string | null;
  resetToken: string | null;
  onSubmit: (mode: AuthMode, formData: FormData, provider?: "EMAIL" | "GOOGLE") => Promise<void>;
  onForgotPassword: (formData: FormData) => Promise<void>;
  onResetPassword: (formData: FormData) => Promise<void>;
  onClearResetToken: () => void;
  onAccessModeChange?: (mode: AuthMode) => void;
  onClearMessages?: () => void;
}) => {
  const [mode, setMode] = useState<AuthMode>(resetToken ? "reset" : "login");
  const [recoverySubmitting, setRecoverySubmitting] = useState(false);
  const formRef = useRef<HTMLFormElement | null>(null);
  const googleButtonRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (resetToken) setMode("reset");
  }, [resetToken]);

  useEffect(() => {
    onAccessModeChange?.(mode);
  }, [mode, onAccessModeChange]);

  useEffect(() => {
    if (success && mode === "reset") {
      setMode("login");
    }
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
          void onSubmit("login", data, "GOOGLE");
        }
      });
      window.google.accounts.id.renderButton(container, {
        theme: "outline",
        size: "large",
        type: "standard",
        text: "signin_with",
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

  const switchMode = (next: AuthMode) => {
    onClearMessages?.();
    setMode(next);
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    uiSounds.submit();

    if (mode === "forgot") {
      setRecoverySubmitting(true);
      try {
        await onForgotPassword(new FormData(event.currentTarget));
      } finally {
        setRecoverySubmitting(false);
      }
      return;
    }

    if (mode === "reset") {
      setRecoverySubmitting(true);
      try {
        await onResetPassword(new FormData(event.currentTarget));
      } finally {
        setRecoverySubmitting(false);
      }
      return;
    }

    void onSubmit("login", new FormData(event.currentTarget), "EMAIL");
  };

  function handleGoogleSubmit() {
    if (!formRef.current) return;
    void onSubmit("login", new FormData(formRef.current), "GOOGLE");
  }

  const isSubmitting = loading !== "idle" || recoverySubmitting;
  const title =
    mode === "reset" ? "Redefinir senha" : mode === "forgot" ? "Recuperar acesso" : brand.loginTitle;
  const description =
    mode === "reset"
      ? "Defina uma nova senha para acessar sua conta."
      : mode === "forgot"
        ? "Informe o e-mail ou telefone cadastrado para receber o link."
        : brand.loginCopy;
  const submitIcon =
    mode === "reset" ? (
      <Save size={18} />
    ) : mode === "forgot" ? (
      <Mail size={18} />
    ) : (
      <LogIn size={18} />
    );

  return (
    <section className="activate-funnel-panel login-command-panel">
      <header className="login-command-panel__head">
        <span className="home-telemetry-label">{brand.accessEyebrow}</span>
        <h2 className="login-command-panel__title">{title}</h2>
        <p className="login-command-panel__copy">{description}</p>
      </header>

      <form ref={formRef} className="login-form login-form--command" onSubmit={handleSubmit}>
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
          {isSubmitting ? <Loader2 className="animate-spin" size={18} /> : submitIcon}
          <span>
            {mode === "reset" ? "Salvar nova senha" : mode === "forgot" ? "Enviar link de recuperação" : "Entrar"}
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
            <button className="ui-btn-ghost login-forgot" type="button" onClick={() => switchMode("forgot")}>
              Esqueci minha senha
            </button>
            <p className="login-command-panel__activate">
              Ainda não tem conta?{" "}
              <Link className="login-command-panel__activate-link" to={paths.activate}>
                Ative seu acesso
              </Link>
            </p>
          </>
        )}

        {(mode === "forgot" || mode === "reset") && (
          <button
            className="ui-btn-ghost login-forgot"
            type="button"
            onClick={() => {
              if (mode === "reset") {
                onClearResetToken();
              } else {
                switchMode("login");
              }
            }}
          >
            <ArrowLeft size={16} />
            Voltar para o login
          </button>
        )}
      </form>
    </section>
  );
};
