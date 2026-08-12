import { Navigate, Route, Routes } from "react-router-dom";
import { AuthProvider } from "./auth/AuthContext";
import { AdminPage, HomePage, LoginPage, StudentPage } from "./auth/pages";
import { GuestRoute, ProtectedRoute, SessionGate } from "./auth/RouteGuards";
import { paths } from "./auth/paths";

function AppRoutes() {
  return (
    <SessionGate>
      <div className="app-view-stage is-visible">
        <Routes>
          <Route path={paths.home} element={<HomePage />} />

          <Route element={<GuestRoute />}>
            <Route path={paths.login} element={<LoginPage />} />
          </Route>

          <Route element={<ProtectedRoute role="ADMIN" />}>
            <Route path={paths.admin} element={<AdminPage />} />
          </Route>

          <Route element={<ProtectedRoute role="USER" />}>
            <Route path={paths.student} element={<StudentPage />} />
          </Route>

          <Route path="*" element={<Navigate to={paths.home} replace />} />
        </Routes>
      </div>
    </SessionGate>
  );
}

export function App() {
  return (
    <AuthProvider>
      <div className="ui-shell min-h-screen overflow-x-hidden">
        <AppRoutes />
      </div>
    </AuthProvider>
  );
}
