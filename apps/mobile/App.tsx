import { StatusBar } from "expo-status-bar";
import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { fetchSessionUser, NativeApiError, setUnauthorizedHandler } from "./src/auth/api";
import { clearNativeSession, readNativeSession, writeNativeSession } from "./src/auth/session";
import type { NativeSession } from "./src/auth/types";
import { musicPlayback } from "./src/musicPlayback";
import { StudentShell } from "./src/navigation/StudentShell";
import { AdminNoticeScreen } from "./src/screens/AdminNoticeScreen";
import { LoginScreen } from "./src/screens/LoginScreen";
import { StudentProvider } from "./src/student/StudentContext";
import { getTheme, hydrateMapCompass, hydrateTheme, setTheme } from "./src/student/prefs";
import { StudentThemeProvider, tokensFor, useSt } from "./src/student/theme";
import { hydrateUiSounds, preloadUiSounds, uiSounds } from "./src/student/uiSounds";

function BootScreen() {
  const bg = tokensFor(getTheme()).bg;
  return (
    <View style={[styles.boot, { backgroundColor: bg }]}>
      <ActivityIndicator color="#f2b461" size="large" />
    </View>
  );
}

function ThemedStatusBar() {
  const { st } = useSt();
  return <StatusBar style="light" backgroundColor={st.headerFrom} />;
}

function StudentSoundsBoot() {
  useEffect(() => {
    uiSounds.bootUp();
    preloadUiSounds();
  }, []);
  return null;
}

function AppGate() {
  const [ready, setReady] = useState(false);
  const [session, setSession] = useState<NativeSession | null>(null);

  const onLogout = useCallback(() => {
    uiSounds.toggleOff();
    void musicPlayback.stop();
    void clearNativeSession();
    setSession(null);
  }, []);

  useEffect(() => {
    setUnauthorizedHandler(onLogout);
    return () => setUnauthorizedHandler(null);
  }, [onLogout]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const stored = await readNativeSession();
      if (!stored) {
        if (!cancelled) {
          setSession(null);
          setReady(true);
        }
        return;
      }

      try {
        const user = await fetchSessionUser(stored.token);
        if (cancelled) return;
        if (!user) {
          await clearNativeSession();
          setSession(null);
        } else {
          const next = { token: stored.token, user };
          await writeNativeSession(next);
          setSession(next);
        }
      } catch (error) {
        if (cancelled) return;
        if (error instanceof NativeApiError && error.status === 401) {
          await clearNativeSession();
          setSession(null);
        } else {
          // Falha de rede/servidor não invalida a sessão: mantém o acesso offline.
          setSession(stored);
        }
      }
      if (!cancelled) setReady(true);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const onLoggedIn = useCallback((next: NativeSession) => {
    setTheme("light");
    setSession(next);
    preloadUiSounds();
    void writeNativeSession(next).catch((error) => {
      console.warn("Falha ao persistir sessão nativa", error);
    });
  }, []);

  if (!ready) return <BootScreen />;
  if (!session) return <LoginScreen onLoggedIn={onLoggedIn} />;
  if (session.user.role === "ADMIN") {
    return <AdminNoticeScreen session={session} onLogout={onLogout} />;
  }
  return (
    <StudentProvider session={session} onLogout={onLogout}>
      <StudentSoundsBoot />
      <StudentShell />
    </StudentProvider>
  );
}

export default function App() {
  const [prefsReady, setPrefsReady] = useState(false);

  useEffect(() => {
    void Promise.all([hydrateTheme(), hydrateMapCompass(), hydrateUiSounds()]).then(() => setPrefsReady(true));
  }, []);

  if (!prefsReady) return <BootScreen />;

  return (
    <GestureHandlerRootView style={styles.root}>
      <SafeAreaProvider>
        <StudentThemeProvider>
          <ThemedApp />
        </StudentThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

function ThemedApp() {
  const { st } = useSt();
  return (
    <View style={[styles.root, { backgroundColor: st.bg }]}>
      <ThemedStatusBar />
      <AppGate />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  boot: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#f7f2ea"
  }
});
