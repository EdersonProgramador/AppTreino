import { StatusBar } from "expo-status-bar";
import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { fetchSessionUser, NativeApiError } from "./src/auth/api";
import {
  clearNativeSession,
  readNativeSession,
  sessionAsLocalStorage,
  writeNativeSession
} from "./src/auth/session";
import type { NativeSession } from "./src/auth/types";
import { panelUrlForRole } from "./src/config";
import { musicPlayback } from "./src/musicPlayback";
import { LoginScreen } from "./src/screens/LoginScreen";
import { PanelWebView, resetPanelShell } from "./src/screens/PanelWebView";
import { flushShellSnapshot, mergeShellSnapshot } from "./src/shellSnapshot";

const APP_BG = "#08090b";

function BootScreen() {
  return (
    <View style={styles.boot}>
      <ActivityIndicator color="#f2b461" size="large" />
    </View>
  );
}

function AppGate() {
  const [ready, setReady] = useState(false);
  const [session, setSession] = useState<NativeSession | null>(null);

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
    resetPanelShell();
    setSession(next);
    void (async () => {
      try {
        await writeNativeSession(next);
        await mergeShellSnapshot({
          href: panelUrlForRole(next.user.role),
          localStorage: sessionAsLocalStorage(next)
        });
        await flushShellSnapshot();
      } catch (error) {
        console.warn("Falha ao persistir sessão nativa", error);
      }
    })();
  }, []);

  const onLogout = useCallback(() => {
    resetPanelShell();
    void musicPlayback.stop();
    void clearNativeSession();
    setSession(null);
  }, []);

  if (!ready) return <BootScreen />;
  if (!session) return <LoginScreen onLoggedIn={onLoggedIn} />;
  return <PanelWebView session={session} onLogout={onLogout} />;
}

export default function App() {
  return (
    <SafeAreaProvider>
      <StatusBar style="light" />
      <AppGate />
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  boot: {
    flex: 1,
    alignItems: "center",
    backgroundColor: APP_BG,
    justifyContent: "center"
  }
});
