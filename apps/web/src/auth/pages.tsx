import { useEffect } from "react";
import { Link, Navigate, useNavigate, useSearchParams } from "react-router-dom";
import { ArrowLeft, LogIn } from "lucide-react";
import { LoginView } from "../components/auth/LoginView";
import { AppDownloadSoonView } from "../components/home/AppDownloadSoonView";
import { HomeView } from "../components/home/HomeView";
import { SharedPostPage } from "../components/shared/SharedPostPage";
import { PrivacyPage, RefundPolicyPage, TermsPage } from "../components/legal/LegalPages";
import { assetUrl } from "../lib/urls";
import { brand } from "../lib/brand";
import { useAuth } from "./AuthContext";
import { AdminPanel, StudentPanel, TransitionScreen } from "./RouteGuards";
import { homePathForRole, loginPath, paths } from "./paths";

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
      onStart={(planCode) => navigate(loginPath(planCode))}
      onDownloadApp={() => navigate(paths.download)}
      onLogin={() => navigate(paths.login)}
    />
  );
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
    selectedPlanCode,
    setSelectedPlanCode,
    resetToken,
    setResetToken,
    submitAuth,
    submitRegisterOnboarding,
    submitForgotPassword,
    submitResetPassword
  } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();

  useEffect(() => {
    const reset = searchParams.get("reset");
    if (reset) {
      setResetToken(reset);
      const next = new URLSearchParams(searchParams);
      next.delete("reset");
      setSearchParams(next, { replace: true });
    }
  }, [searchParams, setResetToken, setSearchParams]);

  useEffect(() => {
    const plan = searchParams.get("plan");
    if (plan === "monthly" || plan === "annual") {
      setSelectedPlanCode(plan);
    }
  }, [searchParams, setSelectedPlanCode]);

  const forceRegister = searchParams.get("mode") === "register";

  // signingIn: mantém o formulário (spinner no botão). Só bloqueia em restore/redirect.
  if (phase === "restoring" || phase === "redirecting") {
    return <TransitionScreen message={transitionMessage} />;
  }

  if (user && token) {
    return <Navigate to={homePathForRole(user.role)} replace />;
  }

  return (
    <div className="login-shell">
      <GuestChrome variant="login" />
      <LoginView
        loading={loginState}
        error={loginError}
        success={loginSuccess}
        selectedPlanCode={selectedPlanCode}
        preferRegister={forceRegister}
        resetToken={resetToken}
        onSubmit={submitAuth}
        onRegisterOnboarding={submitRegisterOnboarding}
        onForgotPassword={submitForgotPassword}
        onResetPassword={submitResetPassword}
        onClearResetToken={() => {
          setResetToken(null);
          navigate(paths.login, { replace: true });
        }}
      />
    </div>
  );
}

export function GuestChrome({ variant = "default" }: { variant?: "default" | "login" }) {
  return (
    <header className="guest-chrome sticky top-0 z-20 flex min-h-[56px] items-center justify-between gap-3 border-b px-4 backdrop-blur-md sm:min-h-[64px] sm:px-8 md:px-12">
      <Link className="inline-flex min-w-0 shrink items-center border-0 bg-transparent p-0" to={paths.home} aria-label="Ir para início">
        <img
          className="block h-auto w-[clamp(124px,38vw,200px)] max-w-full rounded-lg drop-shadow-lg"
          src={assetUrl("assets/app-treino-logo.svg")}
          alt={brand.name}
        />
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
