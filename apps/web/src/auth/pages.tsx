import { useEffect, useMemo, useState } from "react";
import { Link, Navigate, useNavigate, useSearchParams } from "react-router-dom";
import { ArrowLeft, LogIn } from "lucide-react";
import { ActivateView } from "../components/checkout/ActivateView";
import { LoginView } from "../components/auth/LoginView";
import { SubscriptionCheckoutShell } from "../components/checkout/SubscriptionCheckoutShell";
import { AppDownloadSoonView } from "../components/home/AppDownloadSoonView";
import { HomeView } from "../components/home/HomeView";
import { SharedPostPage } from "../components/shared/SharedPostPage";
import { PrivacyPage, RefundPolicyPage, TermsPage } from "../components/legal/LegalPages";
import { assetUrl } from "../lib/urls";
import { brand } from "../lib/brand";
import { useAuth } from "./AuthContext";
import { AdminPanel, CoachPanel, StudentPanel, TransitionScreen } from "./RouteGuards";
import { activatePath, homePathForRole, loginPath, paths } from "./paths";
import { setPostLoginDestination } from "./session";
import type { AuthMode } from "../types/auth";

function loginShellCopy(mode: AuthMode) {
  switch (mode) {
    case "forgot":
      return {
        title: "Recuperar acesso",
        subtitle: "Enviaremos um link seguro para redefinir sua senha no ATLLY Command."
      };
    case "reset":
      return {
        title: "Redefinir senha",
        subtitle: "Crie uma nova senha para voltar aos treinos, corrida e performance."
      };
    default:
      return {
        title: "Entrar no ATLLY Command",
        subtitle: "Acesse treinos, corrida, performance e sua rede de atletas em um único sistema."
      };
  }
}

export function HomePage() {
  const { user, token, isTransitioning, transitionMessage } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  useEffect(() => {
    const reset = searchParams.get("reset");
    if (!reset) return;
    navigate(`${paths.login}?reset=${encodeURIComponent(reset)}`, { replace: true });
  }, [navigate, searchParams]);

  if (isTransitioning) {
    return <TransitionScreen message={transitionMessage} />;
  }

  if (user && token) {
    return <Navigate to={homePathForRole(user.role)} replace />;
  }

  return (
    <HomeView
      onStart={(planCode, couponCode) => navigate(activatePath(planCode, couponCode))}
      onLogin={() => navigate(paths.login)}
    />
  );
}

export function ActivatePage() {
  return <ActivateView />;
}

export function DownloadPage() {
  const { user, token, isTransitioning, transitionMessage } = useAuth();

  if (isTransitioning) {
    return <TransitionScreen message={transitionMessage} />;
  }

  if (user && token) {
    return <Navigate to={homePathForRole(user.role)} replace />;
  }

  return <AppDownloadSoonView />;
}

export function SharedPostRoute() {
  return <SharedPostPage />;
}

export function TermsPageRoute() {
  const { user, token, isTransitioning, transitionMessage } = useAuth();
  if (isTransitioning) return <TransitionScreen message={transitionMessage} />;
  if (user && token) return <Navigate to={homePathForRole(user.role)} replace />;
  return <TermsPage />;
}

export function PrivacyPageRoute() {
  const { user, token, isTransitioning, transitionMessage } = useAuth();
  if (isTransitioning) return <TransitionScreen message={transitionMessage} />;
  if (user && token) return <Navigate to={homePathForRole(user.role)} replace />;
  return <PrivacyPage />;
}

export function RefundPolicyPageRoute() {
  const { user, token, isTransitioning, transitionMessage } = useAuth();
  if (isTransitioning) return <TransitionScreen message={transitionMessage} />;
  if (user && token) return <Navigate to={homePathForRole(user.role)} replace />;
  return <RefundPolicyPage />;
}

export function LoginPage() {
  const {
    user,
    token,
    phase,
    transitionMessage,
    loginState,
    loginError,
    loginSuccess,
    resetToken,
    setResetToken,
    submitAuth,
    submitForgotPassword,
    submitResetPassword,
    clearLoginMessages
  } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const [accessMode, setAccessMode] = useState<AuthMode>(resetToken ? "reset" : "login");
  const shellCopy = useMemo(() => loginShellCopy(accessMode), [accessMode]);

  useEffect(() => {
    const reset = searchParams.get("reset");
    const coachInvite = searchParams.get("coach") === "1";
    if (coachInvite) {
      setPostLoginDestination(paths.coach);
    }
    if (reset || coachInvite) {
      if (reset) setResetToken(reset);
      const next = new URLSearchParams(searchParams);
      next.delete("reset");
      next.delete("coach");
      setSearchParams(next, { replace: true });
    }
  }, [searchParams, setResetToken, setSearchParams]);

  useEffect(() => {
    if (resetToken) setAccessMode("reset");
  }, [resetToken]);

  useEffect(() => {
    const plan = searchParams.get("plan");
    if (plan?.trim()) {
      navigate(`${paths.activate}?plan=${encodeURIComponent(plan.trim())}`, { replace: true });
      return;
    }

    if (searchParams.get("mode") === "register") {
      const post = searchParams.get("post");
      const params = new URLSearchParams();
      if (post?.trim()) params.set("post", post.trim());
      const query = params.toString();
      navigate(query ? `${paths.activate}?${query}` : paths.activate, { replace: true });
    }
  }, [navigate, searchParams]);

  if (phase === "restoring" || phase === "redirecting") {
    return <TransitionScreen message={transitionMessage} />;
  }

  if (user && token) {
    return <Navigate to={homePathForRole(user.role)} replace />;
  }

  return (
    <SubscriptionCheckoutShell
      eyebrow={brand.accessEyebrow}
      title={shellCopy.title}
      subtitle={shellCopy.subtitle}
      backHref={paths.home}
      backLabel="Voltar ao site"
    >
      <LoginView
        loading={loginState}
        error={loginError}
        success={loginSuccess}
        resetToken={resetToken}
        onSubmit={submitAuth}
        onForgotPassword={submitForgotPassword}
        onResetPassword={submitResetPassword}
        onAccessModeChange={setAccessMode}
        onClearMessages={clearLoginMessages}
        onClearResetToken={() => {
          clearLoginMessages();
          setResetToken(null);
          setAccessMode("login");
          navigate(paths.login, { replace: true });
        }}
      />
    </SubscriptionCheckoutShell>
  );
}

export function GuestChrome({ variant = "default" }: { variant?: "default" | "login" }) {
  return (
    <header className="guest-chrome sticky top-0 z-20 flex min-h-[56px] items-center justify-between gap-3 border-b px-4 backdrop-blur-md sm:min-h-[64px] sm:px-8 md:px-12">
      <Link className="inline-flex min-w-0 shrink flex-col no-underline" to={paths.home} aria-label="Ir para início">
        <img
          className="block h-auto w-[clamp(124px,38vw,200px)] max-w-full rounded-lg drop-shadow-lg"
          src={assetUrl("assets/atlly-logo.png")}
          alt={brand.name}
        />
        <span className="mt-0.5 truncate text-[9px] font-bold uppercase tracking-[0.18em] text-brand-silver sm:tracking-[0.22em]">
          {brand.category}
        </span>
      </Link>
      {variant === "login" ? (
        <Link className="guest-chrome-link inline-flex items-center gap-2 border-0 bg-transparent text-sm font-bold no-underline" to={paths.home}>
          <ArrowLeft size={16} />
          Voltar
        </Link>
      ) : (
        <div className="flex shrink-0 items-center justify-end gap-3.5">
          <Link className="guest-chrome-link inline-flex items-center gap-2 border-0 bg-transparent text-sm font-bold transition hover:-translate-y-px" to={paths.login}>
            <LogIn size={18} />
            Entrar
          </Link>
        </div>
      )}
    </header>
  );
}

export function AdminPage() {
  return <AdminPanel />;
}

export function StudentPage() {
  return <StudentPanel />;
}

export function CoachPage() {
  return <CoachPanel />;
}
