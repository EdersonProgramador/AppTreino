import { useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import * as Linking from "expo-linking";
import { API_URL, WEB_URL } from "../config";
import { loginWithPassword, NativeApiError, requestPasswordReset } from "../auth/api";
import type { NativeSession } from "../auth/types";

const GOLD = "#f2b461";
const SAND = "#fff7ec";
const INK = "#08090b";

export function LoginScreen({
  onLoggedIn
}: {
  onLoggedIn: (session: NativeSession) => void | Promise<void>;
}) {
  const [mode, setMode] = useState<"login" | "forgot">("login");
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  async function submit() {
    setError(null);
    setSuccess(null);
    const id = identifier.trim();
    if (!id) {
      setError("Informe e-mail ou telefone.");
      return;
    }

    setSubmitting(true);
    try {
      if (mode === "forgot") {
        const response = await requestPasswordReset(id);
        setSuccess(response.message || "Se a conta existir, enviamos o link de recuperação.");
        return;
      }
      if (password.length < 6) {
        setError("A senha precisa ter pelo menos 6 caracteres.");
        return;
      }
      const session = await loginWithPassword(id, password);
      await onLoggedIn(session);
    } catch (caught) {
      const message =
        caught instanceof NativeApiError
          ? caught.message
          : caught instanceof Error
            ? caught.message
            : "Não foi possível entrar. Verifique a API e a rede.";
      setError(message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <SafeAreaView style={styles.safe} edges={["top", "right", "bottom", "left"]}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={styles.flex}
      >
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
        >
          <View style={styles.panel}>
            <Text style={styles.eyebrow}>Área de acesso</Text>
            <Text style={styles.title}>{mode === "forgot" ? "Recuperar acesso" : "Entrar"}</Text>
            <Text style={styles.copy}>
              {mode === "forgot"
                ? "Informe o e-mail ou telefone cadastrado."
                : "Acesse com e-mail ou telefone. O painel continua o mesmo; o login agora é nativo."}
            </Text>

            <Text style={styles.label}>E-mail ou telefone</Text>
            <TextInput
              autoCapitalize="none"
              autoComplete="username"
              autoCorrect={false}
              keyboardType="email-address"
              onChangeText={setIdentifier}
              placeholder="Seu e-mail ou telefone"
              placeholderTextColor="#8f887f"
              style={styles.input}
              value={identifier}
            />

            {mode === "login" ? (
              <>
                <Text style={styles.label}>Senha</Text>
                <TextInput
                  autoComplete="password"
                  onChangeText={setPassword}
                  onSubmitEditing={() => void submit()}
                  placeholder="Mínimo 6 caracteres"
                  placeholderTextColor="#8f887f"
                  secureTextEntry
                  style={styles.input}
                  value={password}
                />
              </>
            ) : null}

            {error ? <Text style={styles.error}>{error}</Text> : null}
            {success ? <Text style={styles.ok}>{success}</Text> : null}

            <Pressable
              accessibilityRole="button"
              disabled={submitting}
              onPress={() => void submit()}
              style={({ pressed }) => [
                styles.button,
                pressed ? styles.buttonPressed : null,
                submitting ? styles.buttonDisabled : null
              ]}
            >
              {submitting ? (
                <ActivityIndicator color={INK} />
              ) : (
                <Text style={styles.buttonText}>{mode === "forgot" ? "Enviar link" : "Entrar"}</Text>
              )}
            </Pressable>

            <Pressable
              onPress={() => {
                setMode(mode === "login" ? "forgot" : "login");
                setError(null);
                setSuccess(null);
              }}
              style={styles.linkWrap}
            >
              <Text style={styles.link}>
                {mode === "login" ? "Esqueci a senha" : "Voltar ao login"}
              </Text>
            </Pressable>

            <Pressable onPress={() => void Linking.openURL(`${WEB_URL}/login`)} style={styles.linkWrap}>
              <Text style={styles.muted}>Criar conta no site</Text>
            </Pressable>
            {error ? <Text style={styles.debug}>API: {API_URL}</Text> : null}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: INK
  },
  flex: {
    flex: 1
  },
  scroll: {
    flexGrow: 1,
    justifyContent: "center"
  },
  panel: {
    paddingHorizontal: 24,
    paddingBottom: 32,
    gap: 8
  },
  eyebrow: {
    color: GOLD,
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 1.4,
    textTransform: "uppercase"
  },
  title: {
    color: SAND,
    fontSize: 32,
    fontWeight: "800"
  },
  copy: {
    color: "#c9c0b5",
    fontSize: 15,
    lineHeight: 22,
    marginBottom: 12
  },
  label: {
    color: "#d8cfc4",
    fontSize: 13,
    fontWeight: "700",
    marginTop: 8
  },
  input: {
    borderColor: "rgba(255,255,255,0.16)",
    borderRadius: 14,
    borderWidth: 1,
    color: SAND,
    fontSize: 16,
    paddingHorizontal: 14,
    paddingVertical: 13,
    backgroundColor: "rgba(255,255,255,0.04)"
  },
  error: {
    color: "#ffd8d4",
    fontSize: 14,
    fontWeight: "600",
    marginTop: 8
  },
  ok: {
    color: "#b8f0c8",
    fontSize: 14,
    fontWeight: "600",
    marginTop: 8
  },
  button: {
    alignItems: "center",
    backgroundColor: GOLD,
    borderRadius: 14,
    justifyContent: "center",
    marginTop: 18,
    minHeight: 52
  },
  buttonPressed: {
    opacity: 0.86
  },
  buttonDisabled: {
    opacity: 0.7
  },
  buttonText: {
    color: INK,
    fontSize: 16,
    fontWeight: "800"
  },
  linkWrap: {
    alignItems: "center",
    paddingVertical: 8
  },
  link: {
    color: GOLD,
    fontSize: 15,
    fontWeight: "700"
  },
  muted: {
    color: "#8f887f",
    fontSize: 13
  },
  debug: {
    color: "#5c564e",
    fontSize: 11,
    textAlign: "center",
    marginTop: 4
  }
});
