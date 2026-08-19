import { useEffect } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { SoundProvider } from "react-sounds";
import { AuthProvider } from "./auth/AuthContext";
import { AdminPage, DownloadPage, HomePage, LoginPage, StudentPage } from "./auth/pages";
import { GuestRoute, ProtectedRoute, RoleHomeRedirect, SessionGate } from "./auth/RouteGuards";
import { paths } from "./auth/paths";
import { useUiPrefsStore } from "./stores/uiPrefsStore";
import { ALL_UI_SOUND_PRELOAD } from "./lib/ui-sounds";
import { installShellStateFlush } from "./lib/shell-persist";

const AppRoutes = () => (
  <SessionGate>
    <div className="app-view-stage is-visible">
      <Routes>
        <Route path={paths.home} element={<HomePage />} />
        <Route path={paths.download} element={<DownloadPage />} />

        <Route element={<GuestRoute />}>
          <Route path={paths.login} element={<LoginPage />} />
        </Route>

        <Route path={paths.app} element={<RoleHomeRedirect />} />

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

export const App = () => {
  const theme = useUiPrefsStore((state) => state.theme);
  const soundEnabled = useUiPrefsStore((state) => state.soundEnabled);

  useEffect(() => {
    useUiPrefsStore.getState().hydrate();
  }, []);

  useEffect(() => {
    return installShellStateFlush();
  }, []);

  return (
    <SoundProvider initialEnabled={soundEnabled} preload={ALL_UI_SOUND_PRELOAD}>
      <AuthProvider>
        <div className={`ui-shell min-h-screen overflow-x-hidden ${theme === "dark" ? "theme-dark" : "theme-light"}`}>
          <AppRoutes />
        </div>
      </AuthProvider>
    </SoundProvider>
  );
};
