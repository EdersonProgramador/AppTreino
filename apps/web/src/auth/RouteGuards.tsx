import { Loader2 } from "lucide-react";
import type { ReactNode } from "react";
import { Navigate, Outlet, useLocation } from "react-router-dom";
import { assetUrl } from "../lib/urls";
import { useAuth } from "./AuthContext";
import { homePathForRole, paths } from "./paths";

export function BootScreen() {
  return (
    <div className="ui-shell app-boot-screen" role="status" aria-live="polite">
      <img src={assetUrl("assets/app-treino-logo.svg")} alt="App Treino" className="app-boot-logo" />
      <Loader2 className="app-boot-spinner animate-spin" size={28} aria-hidden="true" />
      <p>Preparando sua área...</p>
    </div>
  );
}

/** Blocks every route until local token is validated (no Home/Login ghost). */
export function SessionGate({ children }: { children: ReactNode }) {
  const { status } = useAuth();

  if (status === "booting") {
    return <BootScreen />;
  }

  return <>{children}</>;
}

export function GuestRoute() {
  const { isAuthenticated, user } = useAuth();
  const location = useLocation();

  if (isAuthenticated && user) {
    return <Navigate to={homePathForRole(user.role)} replace state={{ from: location }} />;
  }

  return <Outlet />;
}

export function ProtectedRoute({ role }: { role: "ADMIN" | "USER" }) {
  const { isAuthenticated, user, token } = useAuth();
  const location = useLocation();

  if (!isAuthenticated || !user || !token) {
    return <Navigate to={paths.login} replace state={{ from: location }} />;
  }

  if (role === "ADMIN" && user.role !== "ADMIN") {
    return <Navigate to={paths.student} replace />;
  }

  if (role === "USER" && user.role === "ADMIN") {
    return <Navigate to={paths.admin} replace />;
  }

  return <Outlet />;
}
