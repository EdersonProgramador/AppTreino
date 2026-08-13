import { useEffect } from "react";
import { Link, Navigate, useNavigate, useSearchParams } from "react-router-dom";
import { LogIn } from "lucide-react";
import { LoginView } from "../components/auth/LoginView";
import { HomeView } from "../components/home/HomeView";
import { assetUrl } from "../lib/urls";
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
      onLogin={() => navigate(paths.login)}
    />
  );
}

export function LoginPage() {
  const {
    user,
    token,
    isTransitioning,
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

  if (isTransitioning) {
    return <TransitionScreen message={transitionMessage} />;
  }

  if (user && token) {
    return <Navigate to={homePathForRole(user.role)} replace />;
  }

  return (
    <>
      <GuestChrome />
      <LoginView
        loading={loginState}
        error={loginError}
        success={loginSuccess}
        selectedPlanCode={selectedPlanCode}
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
    </>
  );
}

function GuestChrome() {
  return (
    <header className="guest-chrome sticky top-0 z-20 grid min-h-[76px] grid-cols-[minmax(150px,1fr)_auto_minmax(150px,1fr)] items-center gap-6 border-b px-5 backdrop-blur-md sm:px-8 md:px-12">
      <Link className="inline-flex items-center border-0 bg-transparent p-0" to={paths.home} aria-label="Ir para início">
        <img
          className="block h-auto w-[clamp(158px,16vw,218px)] rounded-lg drop-shadow-lg"
          src={assetUrl("assets/app-treino-logo.svg")}
          alt="App Treino"
        />
      </Link>
      <nav className="hidden items-center gap-6 md:flex" aria-label="Navegação principal">
        <Link className="guest-chrome-link text-sm font-bold transition hover:-translate-y-px" to={`${paths.home}#recursos`}>
          Recursos
        </Link>
        <Link className="guest-chrome-link text-sm font-bold transition hover:-translate-y-px" to={`${paths.home}#planos`}>
          Planos
        </Link>
      </nav>
      <div className="flex items-center justify-end gap-3.5">
        <Link className="guest-chrome-link inline-flex items-center gap-2 border-0 bg-transparent text-sm font-bold transition hover:-translate-y-px" to={paths.login}>
          <LogIn size={18} />
          Entrar
        </Link>
      </div>
    </header>
  );
}

export function AdminPage() {
  return <AdminPanel />;
}

export function StudentPage() {
  return <StudentPanel />;
}
