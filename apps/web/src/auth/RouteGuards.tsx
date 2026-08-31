import { Loader2 } from "lucide-react";
import { lazy, Suspense, type ReactNode } from "react";
import { Navigate, Outlet, useLocation } from "react-router-dom";
import { can, canAccessPanel, type UserRole } from "@app-treino/shared";
import { assetUrl } from "../lib/urls";
import { brand } from "../lib/brand";
import { useAuth } from "./AuthContext";
import { canAccessRoleRoute, homePathForRole, isGuestPath, isRoleHomePath, mustRedirectForRole } from "./session";
import { paths } from "./paths";

export function TransitionScreen({ message }: { message?: string }) {
  return (
    <div className="ui-shell app-boot-screen" role="status" aria-live="polite">
      <img src={assetUrl("assets/atlly-logo.png")} alt={brand.name} className="app-boot-logo" />
      <Loader2 className="app-boot-spinner animate-spin" size={28} aria-hidden="true" />
      <p>{message ?? "Preparando sua área..."}</p>
    </div>
  );
}

export function BootScreen() {
  return <TransitionScreen />;
}

/**
 * Blocks every app shell until:
 * - anonymous (guest may browse), or
 * - authenticated AND already on the role home (/aluno or /admin).
 *
 * This is what prevents Home/Login/Admin ghosts during student login.
 */
export function SessionGate({ children }: { children: ReactNode }) {
  const { phase, user, isTransitioning, transitionMessage } = useAuth();
  const location = useLocation();
  const onGuestPath = isGuestPath(location.pathname);

  // Mantém o formulário de login montado durante signingIn (loading fica no próprio form).
  if (phase === "signingIn" && onGuestPath) {
    return <>{children}</>;
  }

  if (isTransitioning || phase === "restoring") {
    return <TransitionScreen message={transitionMessage} />;
  }

  // Credentials settled but URL still guest/wrong panel → keep blocking
  if (phase === "authenticated" && user && mustRedirectForRole(location.pathname, user.role)) {
    return (
      <TransitionScreen
        message={user.role === "ADMIN" ? "Abrindo painel admin..." : "Abrindo seu painel..."}
      />
    );
  }

  return <>{children}</>;
}

export function GuestRoute() {
  const { user, token } = useAuth();
  const location = useLocation();

  // Any live session leaves guest routes immediately (do not wait for phase)
  if (user && token) {
    return <Navigate to={homePathForRole(user.role)} replace state={{ from: location }} />;
  }

  return <Outlet />;
}

export function ProtectedRoute({ role }: { role: UserRole }) {
  const { user, token, isTransitioning, phase } = useAuth();
  const location = useLocation();

  if (isTransitioning) {
    return <TransitionScreen />;
  }

  if (!user || !token) {
    // Sem sessão → Home de vendas (topbar). Evita cair em /login após sair/expirar.
    return <Navigate to={paths.home} replace state={{ from: location }} />;
  }

  // Session exists but still settling onto role home
  if (phase !== "authenticated" && !isRoleHomePath(location.pathname, user.role)) {
    return <TransitionScreen message="Abrindo seu painel..." />;
  }

  if (!canAccessRoleRoute(user.role, role)) {
    return <Navigate to={homePathForRole(user.role)} replace />;
  }

  return <Outlet />;
}

/** Any authenticated session (USER or ADMIN) — used by /coach. */
export function AuthenticatedRoute() {
  const { user, token, isTransitioning, phase } = useAuth();
  const location = useLocation();

  if (isTransitioning) {
    return <TransitionScreen />;
  }

  if (!user || !token) {
    return <Navigate to={paths.home} replace state={{ from: location }} />;
  }

  if (phase !== "authenticated" && !isRoleHomePath(location.pathname, user.role)) {
    return <TransitionScreen message="Abrindo painel profissional..." />;
  }

  return <Outlet />;
}

/** Resolves /app → role home without ever mounting Admin/Student shells. */
export function RoleHomeRedirect() {
  const { user, token, isTransitioning, transitionMessage } = useAuth();

  if (isTransitioning) {
    return <TransitionScreen message={transitionMessage} />;
  }

  if (!user || !token) {
    return <Navigate to={paths.home} replace />;
  }

  return <Navigate to={homePathForRole(user.role)} replace />;
}

const AdminViewLazy = lazy(() =>
  import("../components/admin/AdminView").then((module) => ({ default: module.AdminView }))
);

const UserViewLazy = lazy(() =>
  import("../components/student/UserView").then((module) => ({ default: module.UserView }))
);

const CoachViewLazy = lazy(() =>
  import("../components/coach/CoachView").then((module) => ({ default: module.CoachView }))
);

/** Warm the student chunk as soon as a USER session is established. */
export function preloadStudentPanel() {
  void import("../components/student/UserView");
}

export function preloadAdminPanel() {
  void import("../components/admin/AdminView");
}

export function preloadCoachPanel() {
  void import("../components/coach/CoachView");
}

export function AdminPanel() {
  const { token, user, logout } = useAuth();

  if (!token || !user || !canAccessPanel(user.role, "admin") || !can(user.role, "admin_panel:access")) {
    return <Navigate to={user ? homePathForRole(user.role) : paths.home} replace />;
  }

  return (
    <Suspense fallback={<TransitionScreen message="Abrindo painel admin..." />}>
      <AdminViewLazy token={token} onLogout={logout} />
    </Suspense>
  );
}

export function StudentPanel() {
  const { token, user, logout } = useAuth();

  if (!token || !user) {
    return <Navigate to={paths.home} replace />;
  }

  if (!canAccessPanel(user.role, "student") || !can(user.role, "student_panel:access")) {
    return <Navigate to={homePathForRole(user.role)} replace />;
  }

  return (
    <Suspense fallback={<TransitionScreen message="Abrindo seu painel..." />}>
      <UserViewLazy token={token} onLogout={logout} />
    </Suspense>
  );
}

export function CoachPanel() {
  const { token, user, logout } = useAuth();

  if (!token || !user) {
    return <Navigate to={paths.home} replace />;
  }

  return (
    <Suspense fallback={<TransitionScreen message="Abrindo painel profissional..." />}>
      <CoachViewLazy token={token} userName={user.name} onLogout={logout} />
    </Suspense>
  );
}
