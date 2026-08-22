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
import { useSt } from "../student/theme";
import { uiSounds } from "../student/uiSounds";

export function LoginScreen({
  onLoggedIn
}: {
  onLoggedIn: (session: NativeSession) => void | Promise<void>;
}) {
  const { st } = useSt();
  const [mode, setMode] = useState<"login" | "forgot">("login");
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  async function submit() {
    uiSounds.submit();
    setError(null);
    setSuccess(null);
    const id = identifier.trim();
    if (!id) {
      setError("Informe e-mail ou telefone.");
      uiSounds.error();
      return;
    }

    setSubmitting(true);
    try {
      if (mode === "forgot") {
        const response = await requestPasswordReset(id);
        setSuccess(response.message || "Se a conta existir, enviamos o link de recuperação.");
        uiSounds.info();
        return;
      }
      if (password.length < 6) {
        setError("A senha precisa ter pelo menos 6 caracteres.");
        uiSounds.error();
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
      uiSounds.error();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: st.bg }]} edges={["top", "right", "bottom", "left"]}>
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
            <Text style={[styles.eyebrow, { color: st.gold }]}>Área de acesso</Text>
            <Text style={[styles.title, { color: st.text }]}>{mode === "forgot" ? "Recuperar acesso" : "Entrar"}</Text>
            <Text style={[styles.copy, { color: st.muted }]}>
              {mode === "forgot"
                ? "Informe o e-mail ou telefone cadastrado."
                : "Acesse com e-mail ou telefone. O painel continua o mesmo; o login agora é nativo."}
            </Text>

            <Text style={[styles.label, { color: st.muted }]}>E-mail ou telefone</Text>
            <TextInput
              autoCapitalize="none"
              autoComplete="username"
              autoCorrect={false}
              keyboardType="email-address"
              onChangeText={setIdentifier}
              placeholder="Seu e-mail ou telefone"
              placeholderTextColor={st.faint}
              style={[styles.input, { color: st.text, borderColor: st.line, backgroundColor: st.inputBg }]}
              value={identifier}
            />

            {mode === "login" ? (
              <>
                <Text style={[styles.label, { color: st.muted }]}>Senha</Text>
                <TextInput
                  autoComplete="password"
                  onChangeText={setPassword}
                  onSubmitEditing={() => void submit()}
                  placeholder="Mínimo 6 caracteres"
                  placeholderTextColor={st.faint}
                  secureTextEntry
                  style={[styles.input, { color: st.text, borderColor: st.line, backgroundColor: st.inputBg }]}
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
                { backgroundColor: st.gold },
                pressed ? styles.buttonPressed : null,
                submitting ? styles.buttonDisabled : null
              ]}
            >
              {submitting ? (
                <ActivityIndicator color={st.ink} />
              ) : (
                <Text style={[styles.buttonText, { color: st.ink }]}>{mode === "forgot" ? "Enviar link" : "Entrar"}</Text>
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
              <Text style={[styles.link, { color: st.gold }]}>
                {mode === "login" ? "Esqueci a senha" : "Voltar ao login"}
              </Text>
            </Pressable>

            <Pressable onPress={() => void Linking.openURL(`${WEB_URL}/login`)} style={styles.linkWrap}>
              <Text style={[styles.muted, { color: st.faint }]}>Criar conta no site</Text>
            </Pressable>
            {error ? <Text style={[styles.debug, { color: st.faint }]}>API: {API_URL}</Text> : null}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1
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
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 1.4,
    textTransform: "uppercase"
  },
  title: {
    fontSize: 32,
    fontWeight: "800"
  },
  copy: {
    fontSize: 15,
    lineHeight: 22,
    marginBottom: 12
  },
  label: {
    fontSize: 13,
    fontWeight: "700",
    marginTop: 8
  },
  input: {
    borderRadius: 14,
    borderWidth: 1,
    fontSize: 16,
    paddingHorizontal: 14,
    paddingVertical: 13
  },
  error: {
    color: "#df3838",
    fontSize: 14,
    fontWeight: "600",
    marginTop: 8
  },
  ok: {
    color: "#1f7a52",
    fontSize: 14,
    fontWeight: "600",
    marginTop: 8
  },
  button: {
    alignItems: "center",
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
    fontSize: 16,
    fontWeight: "800"
  },
  linkWrap: {
    alignItems: "center",
    paddingVertical: 8
  },
  link: {
    fontSize: 15,
    fontWeight: "700"
  },
  muted: {
    fontSize: 13
  },
  debug: {
    fontSize: 11,
    textAlign: "center",
    marginTop: 4
  }
});
