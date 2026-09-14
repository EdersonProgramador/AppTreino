import { useState } from "react";
import {
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
import { API_URL } from "../config";
import {
  AtllyAuthHeader,
  AtllyCinemaPanel,
  AtllyGhostLink,
  AtllyPrimaryButton,
  cinema
} from "../auth/atllyAuthUi";
import { loginWithPassword, NativeApiError, requestPasswordReset } from "../auth/api";
import type { NativeSession } from "../auth/types";
import { brand } from "../student/brand";
import { uiSounds } from "../student/uiSounds";

export function LoginScreen({
  onLoggedIn,
  onBackToWelcome,
  onOpenActivate
}: {
  onLoggedIn: (session: NativeSession) => void | Promise<void>;
  onBackToWelcome?: () => void;
  onOpenActivate?: () => void;
}) {
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
    <SafeAreaView style={styles.safe} edges={["top", "right", "bottom", "left"]}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.flex}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag">
          <AtllyAuthHeader
            kicker={brand.name}
            title={mode === "forgot" ? "Recuperar acesso" : "Entrar"}
            subtitle={
              mode === "forgot"
                ? "Informe o e-mail ou telefone cadastrado."
                : "Comande sua mente. Evolua seu corpo. Acesse sua jornada de performance."
            }
            onBack={onBackToWelcome}
          />

          <AtllyCinemaPanel>
            <Text style={styles.label}>E-mail ou telefone</Text>
            <TextInput
              autoCapitalize="none"
              autoComplete="username"
              autoCorrect={false}
              keyboardType="email-address"
              onChangeText={setIdentifier}
              placeholder="Seu e-mail ou telefone"
              placeholderTextColor={cinema.faint}
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
                  placeholderTextColor={cinema.faint}
                  secureTextEntry
                  style={styles.input}
                  value={password}
                />
              </>
            ) : null}

            {error ? <Text style={styles.error}>{error}</Text> : null}
            {success ? <Text style={styles.ok}>{success}</Text> : null}
            {__DEV__ || error ? <Text style={styles.debug}>API: {API_URL}</Text> : null}

            <AtllyPrimaryButton
              label={mode === "forgot" ? "Enviar link" : "Entrar na ATLLY"}
              loading={submitting}
              disabled={submitting}
              onPress={() => void submit()}
              style={styles.cta}
            />

            <Pressable
              onPress={() => {
                setMode(mode === "login" ? "forgot" : "login");
                setError(null);
                setSuccess(null);
              }}
              style={styles.linkWrap}
            >
              <Text style={styles.link}>{mode === "login" ? "Esqueci a senha" : "Voltar ao login"}</Text>
            </Pressable>

            {onOpenActivate ? (
              <AtllyGhostLink
                label="Ativar agora"
                onPress={() => {
                  uiSounds.toggleOn();
                  onOpenActivate();
                }}
              />
            ) : null}
          </AtllyCinemaPanel>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: cinema.bg },
  flex: { flex: 1 },
  scroll: {
    flexGrow: 1,
    justifyContent: "center",
    paddingHorizontal: 20,
    paddingBottom: 32,
    gap: 20
  },
  label: {
    color: cinema.gold,
    fontSize: 12,
    fontWeight: "800",
    marginTop: 8,
    textTransform: "uppercase"
  },
  input: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: cinema.lineStrong,
    backgroundColor: cinema.inputBg,
    color: cinema.text,
    fontSize: 16,
    marginTop: 6,
    paddingHorizontal: 14,
    paddingVertical: 13
  },
  error: {
    color: cinema.error,
    fontSize: 14,
    fontWeight: "600",
    marginTop: 8
  },
  ok: {
    color: "#7dd4a8",
    fontSize: 14,
    fontWeight: "600",
    marginTop: 8
  },
  cta: { marginTop: 12 },
  linkWrap: { alignItems: "center", paddingVertical: 6 },
  link: { color: cinema.gold, fontSize: 15, fontWeight: "700" },
  debug: {
    color: cinema.faint,
    fontSize: 11,
    textAlign: "center",
    marginTop: 4
  }
});
