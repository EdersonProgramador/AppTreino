import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  type ReactNode
} from "react";
import { useLocation, useNavigate } from "react-router-dom";
import type { AuthUser } from "@app-treino/shared";
import { ApiError, apiGet, apiPost, setUnauthorizedHandler } from "../api";
import type { NativeCheckoutPayload, PaymentRow } from "../types/shared";
import type { WorkoutOnboardingSubmitPayload } from "../components/onboarding/WorkoutOnboarding";
import { levelLabel } from "../components/onboarding/onboarding.schema";
import {
  selectAuthModeLabel,
  selectIsAuthenticated,
  selectIsTransitioning,
  useAuthStore
} from "../stores/authStore";
import {
  homePathForRole,
  isRoleHomePath,
  mustRedirectForRole,
  normalizeAuthUser,
  persistStoredUser,
  readStoredUser
} from "./session";
import { paths, unpaidStudentActivatePath } from "./paths";
import { clearCheckoutIntent, readCheckoutIntent, resolveCheckoutCouponSelection, resolveCheckoutPlanSelection } from "../lib/checkout-intent";
import { fetchStudentPortalAccess } from "../lib/student-portal-access";
import { preloadAdminPanel, preloadStudentPanel } from "./RouteGuards";
import { useMusicPlayerStore } from "../stores/musicPlayerStore";
import { clearStudentPanel } from "../lib/student-panel-persist";
import { clearWorkoutRunner } from "../lib/workout-runner-persist";

function buildForgotPasswordPayload(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const phoneRaw = String(formData.get("phone") ?? "").trim();
  const identifier = String(formData.get("identifier") ?? "").trim();
  const resolvedEmail = email || (identifier.includes("@") ? identifier.toLowerCase() : undefined);
  const resolvedPhoneRaw = phoneRaw || (!identifier.includes("@") ? identifier : undefined);
  const resolvedPhone = resolvedPhoneRaw ? resolvedPhoneRaw.replace(/\D/g, "") : undefined;

  return {
    email: resolvedEmail || undefined,
    phone: resolvedPhone && resolvedPhone.length >= 8 ? resolvedPhone : resolvedPhoneRaw || undefined
  };
}

import { flushShellStateToNative } from "../lib/shell-persist";
import { isNativeAppShell, nativeLogout } from "../lib/native-bridge";

type AuthContextValue = {
  phase: ReturnType<typeof useAuthStore.getState>["phase"];
  status: "booting" | "anonymous" | "authenticated" | "transitioning";
  user: AuthUser | null;
  token: string | null;
  isAuthenticated: boolean;
  isTransitioning: boolean;
  transitionMessage: string;
  loginState: "idle" | "submitting";
  loginError: string | null;
  loginSuccess: string | null;
  resetToken: string | null;
  selectedPlanCode: PlanCode | null;
  setSelectedPlanCode: (plan: PlanCode | null) => void;
  setResetToken: (token: string | null) => void;
  clearLoginMessages: () => void;
  logout: () => void;
  submitAuth: (mode: AuthMode, formData: FormData, provider?: "EMAIL" | "GOOGLE") => Promise<void>;
  submitRegisterOnboarding: (payload: WorkoutOnboardingSubmitPayload) => Promise<void>;
  submitForgotPassword: (formData: FormData) => Promise<void>;
  submitResetPassword: (formData: FormData) => Promise<void>;
  enterAdminPreview: () => Promise<void>;
  exitAdminPreview: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const location = useLocation();
  const pathnameRef = useRef(location.pathname);
  pathnameRef.current = location.pathname;

  const phase = useAuthStore((s) => s.phase);
  const user = useAuthStore((s) => s.user);
  const token = useAuthStore((s) => s.token);
  const loginError = useAuthStore((s) => s.loginError);
  const loginSuccess = useAuthStore((s) => s.loginSuccess);
  const resetToken = useAuthStore((s) => s.resetToken);
  const selectedPlanCode = useAuthStore((s) => s.selectedPlanCode);
  const pendingDestination = useAuthStore((s) => s.pendingDestination);
  const isAuthenticated = useAuthStore(selectIsAuthenticated);
  const isTransitioning = useAuthStore(selectIsTransitioning);
  const transitionMessage = useAuthStore(selectAuthModeLabel);

  const status: AuthContextValue["status"] =
    phase === "restoring"
      ? "booting"
      : phase === "signingIn" || phase === "redirecting"
        ? "transitioning"
        : phase === "authenticated"
          ? "authenticated"
          : "anonymous";

  const loginState: "idle" | "submitting" =
    phase === "signingIn" || phase === "redirecting" ? "submitting" : "idle";

  // Wire 401 → clear session (web). No app nativo a sessão é do login nativo:
  // um /me 401 na hidratação não pode expulsar o usuário de volta à tela de login.
  useEffect(() => {
    setUnauthorizedHandler(() => {
      useMusicPlayerStore.getState().reset();
      clearStudentPanel();
      clearWorkoutRunner();
      flushShellStateToNative();
      if (isNativeAppShell()) return;
      nativeLogout();
      useAuthStore.getState().clearSession();
      navigate(paths.home, { replace: true });
    });
    return () => setUnauthorizedHandler(null);
  }, [navigate]);

  // Restore session from stored token (cold boot)
  useEffect(() => {
    const store = useAuthStore.getState();
    if (!store.token) {
      if (store.phase !== "anonymous") store.clearSession();
      return;
    }

    // Login just established session — soft-validate without tearing down the redirect
    if (store.phase === "redirecting" || store.phase === "authenticated") {
      let cancelled = false;
      apiGet<{ user: AuthUser | null }>("/me", store.token)
        .then((response) => {
          if (cancelled) return;
          if (!response.user) {
            if (!isNativeAppShell()) {
              store.clearSession();
              navigate(paths.home, { replace: true });
            }
            return;
          }
          const nextUser = normalizeAuthUser(response.user);
          persistStoredUser(nextUser);
          useAuthStore.setState({ user: nextUser });
          // If /me corrects the role, bounce to the right panel under the gate
          const destination = homePathForRole(nextUser.role);
          if (mustRedirectForRole(pathnameRef.current, nextUser.role)) {
            store.beginRedirect(destination);
            navigate(destination, { replace: true });
          }
        })
        .catch((error) => {
          if (cancelled) return;
          // Only drop session on hard auth failure — send guest to Home (topbar), not /login
          if (error instanceof ApiError && error.status === 401 && !isNativeAppShell()) {
            store.clearSession();
            navigate(paths.home, { replace: true });
          }
        });
      return () => {
        cancelled = true;
      };
    }

    let cancelled = false;
    let retryTimer: number | null = null;
    store.beginRestore();

    const finishRestore = (nextUser: AuthUser) => {
      const destination = homePathForRole(nextUser.role);
      persistStoredUser(nextUser);
      useAuthStore.setState({ user: nextUser });
      if (mustRedirectForRole(pathnameRef.current, nextUser.role)) {
        store.beginRedirect(destination);
        navigate(destination, { replace: true });
        return;
      }
      store.completeRedirect();
    };

    const restore = () => {
      void apiGet<{ user: AuthUser | null }>("/me", store.token!)
        .then((response) => {
          if (cancelled) return;
          if (!response.user) {
            if (isNativeAppShell()) {
              const cachedUser = readStoredUser();
              if (cachedUser) finishRestore(cachedUser);
              return;
            }
            store.clearSession();
            navigate(paths.home, { replace: true });
            return;
          }
          finishRestore(normalizeAuthUser(response.user));
        })
        .catch((error) => {
          if (cancelled) return;
          if (error instanceof ApiError && error.status === 401) {
            if (isNativeAppShell()) {
              const cachedUser = readStoredUser();
              if (cachedUser) finishRestore(cachedUser);
              return;
            }
            store.clearSession();
            navigate(paths.home, { replace: true });
            return;
          }

          // Offline: usa a identidade validada anteriormente e tenta /me novamente.
          const cachedUser = readStoredUser();
          if (cachedUser) {
            finishRestore(cachedUser);
            return;
          }
          retryTimer = window.setTimeout(restore, 2000);
        });
    };
    restore();

    return () => {
      cancelled = true;
      if (retryTimer) window.clearTimeout(retryTimer);
    };
    // Only on mount / token identity change
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  // Settle redirecting → authenticated ONLY when URL is the role home (no timeout ghost)
  useEffect(() => {
    if (phase !== "redirecting" || !user) return;

    const target = pendingDestination ?? homePathForRole(user.role);
    if (isRoleHomePath(location.pathname, user.role) || location.pathname === target) {
      useAuthStore.getState().completeRedirect();
      return;
    }

    navigate(target, { replace: true });
  }, [phase, user, pendingDestination, location.pathname, navigate]);

  // Keep students off /admin (and admins off /aluno) while session is live
  useEffect(() => {
    if (!user || !token) return;
    if (phase === "restoring" || phase === "signingIn") return;
    if (!mustRedirectForRole(location.pathname, user.role)) return;

    const destination = homePathForRole(user.role);
    if (phase !== "redirecting") {
      useAuthStore.getState().beginRedirect(destination);
    }
    navigate(destination, { replace: true });
  }, [user, token, phase, location.pathname, navigate]);

  const logout = useCallback(() => {
    useMusicPlayerStore.getState().reset();
    clearStudentPanel();
    clearWorkoutRunner();
    nativeLogout();
    flushShellStateToNative();
    useAuthStore.getState().clearSession();
    navigate(paths.home, { replace: true });
  }, [navigate]);

  const enterAdminPreview = useCallback(async () => {
    const store = useAuthStore.getState();
    if (!store.token) {
      throw new Error("Sessão administrativa inválida.");
    }

    const response = await apiPost<{ user: AuthUser; token: string }>(
      "/auth/admin-preview/enter",
      {},
      store.token
    );
    store.switchSession(response, paths.student);
    preloadStudentPanel();
    navigate(paths.student, { replace: true });
  }, [navigate]);

  const exitAdminPreview = useCallback(async () => {
    const store = useAuthStore.getState();
    if (!store.token) {
      throw new Error("Sessão de preview inválida.");
    }

    const response = await apiPost<{ user: AuthUser; token: string }>(
      "/auth/admin-preview/exit",
      {},
      store.token
    );
    store.switchSession(response, paths.admin);
    preloadAdminPanel();
    navigate(paths.admin, { replace: true });
  }, [navigate]);

  const setSelectedPlanCode = useCallback((plan: PlanCode | null) => {
    useAuthStore.getState().setSelectedPlanCode(plan);
  }, []);

  const setResetToken = useCallback((value: string | null) => {
    useAuthStore.getState().setResetToken(value);
  }, []);

  const clearLoginMessages = useCallback(() => {
    useAuthStore.getState().clearLoginMessages();
  }, []);

  const submitAuth = useCallback(
    async (mode: AuthMode, formData: FormData, provider: "EMAIL" | "GOOGLE" = "EMAIL") => {
      const store = useAuthStore.getState();
      store.beginSignIn();

      const name = String(formData.get("name") ?? "").trim();
      const email = String(formData.get("email") ?? "").trim().toLowerCase();
      const phone = String(formData.get("phone") ?? "").trim();
      const document = String(formData.get("document") ?? "").trim();
      const gender = String(formData.get("gender") ?? "").trim();
      const birthDate = String(formData.get("birthDate") ?? "").trim();
      const objective = String(formData.get("objective") ?? "").trim();
      const level = String(formData.get("level") ?? "").trim();
      const daysPerWeekRaw = String(formData.get("daysPerWeek") ?? "").trim();
      const equipmentTagsRaw = String(formData.get("equipmentTags") ?? "").trim();
      const identifier = String(formData.get("identifier") ?? "").trim();
      const password = String(formData.get("password") ?? "");
      const billingType = String(formData.get("billingType") ?? "UNDEFINED");
      const acceptTermsRaw = formData.get("acceptTerms");
      const acceptPrivacyRaw = formData.get("acceptPrivacy");
      const acceptTerms = acceptTermsRaw === "true" || acceptTermsRaw === "on";
      const acceptPrivacy = acceptPrivacyRaw === "true" || acceptPrivacyRaw === "on";
      const idToken = String(formData.get("idToken") ?? "").trim();
      const credential = String(formData.get("credential") ?? "").trim();
      const checkoutIntent = readCheckoutIntent();
      const planCode =
        checkoutIntent?.planCode?.trim() ||
        store.selectedPlanCode?.trim() ||
        null;
      const couponForCheckout =
        resolveCheckoutCouponSelection({ checkoutIntent }) || null;
      const isCheckoutRegister = mode === "register" && Boolean(planCode);
      const endpoint =
        provider === "GOOGLE"
          ? "/auth/google"
          : mode === "login"
            ? "/auth/login"
            : isCheckoutRegister
              ? "/checkout/register"
              : "/auth/register";

      const daysPerWeek = daysPerWeekRaw ? Number(daysPerWeekRaw) : undefined;
      const equipmentTags = equipmentTagsRaw
        ? equipmentTagsRaw
            .split(",")
            .map((tag) => tag.trim())
            .filter(Boolean)
        : undefined;

      const payload =
        provider === "GOOGLE"
          ? {
              name: name || "Usuário Google",
              email: email || (identifier.includes("@") ? identifier : undefined),
              phone: phone || (!identifier.includes("@") ? identifier : undefined),
              gender: mode === "register" ? gender || undefined : undefined,
              idToken: idToken || credential || undefined,
              credential: credential || idToken || undefined
            }
          : mode === "login"
            ? {
                email: email || (identifier.includes("@") ? identifier : undefined),
                phone: phone || (!identifier.includes("@") ? identifier : undefined),
                password,
                provider
              }
            : isCheckoutRegister
              ? {
                  name,
                  email: email || undefined,
                  phone: phone || undefined,
                  document,
                  gender: gender || undefined,
                  birthDate: birthDate || undefined,
                  objective: objective || undefined,
                  level: level || undefined,
                  daysPerWeek,
                  equipmentTags,
                  password,
                  planCode,
                  couponCode: couponForCheckout,
                  billingType,
                  acceptTerms: acceptTerms ? true : undefined,
                  acceptPrivacy: acceptPrivacy ? true : undefined
                }
              : {
                  name,
                  email: email || undefined,
                  phone: phone || undefined,
                  document,
                  gender: gender || undefined,
                  birthDate: birthDate || undefined,
                  objective: objective || undefined,
                  level: level || undefined,
                  daysPerWeek,
                  equipmentTags,
                  password,
                  provider,
                  acceptTerms: acceptTerms ? true : undefined,
                  acceptPrivacy: acceptPrivacy ? true : undefined
                };

      try {
        if (provider === "GOOGLE" && !idToken && !credential) {
          throw new ApiError(401, "Credencial do Google não recebida. Recarregue a página e tente novamente.");
        }

        const response = await apiPost<{
          user: AuthUser;
          token: string;
          payment?: PaymentRow | null;
          nativeCheckout?: NativeCheckoutPayload;
          paymentProviderError?: string;
        }>(endpoint, payload);

        const checkoutIntentAfter = readCheckoutIntent();
        const planForCheckout = resolveCheckoutPlanSelection({
          checkoutIntent: checkoutIntentAfter,
          selectedPlanCode: store.selectedPlanCode,
          membershipPlanCode: null
        }) || planCode;
        const couponForRedirect =
          resolveCheckoutCouponSelection({ checkoutIntent: checkoutIntentAfter }) || undefined;
        let destination = store.establishSession(response);

        if (response.user.role === "USER" && !response.user.previewMode) {
          try {
            const access = await fetchStudentPortalAccess(response.token);
            if (access.hasAccess) {
              clearCheckoutIntent();
              destination = paths.student;
            } else {
              destination = unpaidStudentActivatePath(
                access.membership,
                planForCheckout ?? checkoutIntent?.planCode ?? undefined,
                couponForRedirect
              );
            }
          } catch {
            destination = unpaidStudentActivatePath(
              null,
              planForCheckout ?? checkoutIntent?.planCode ?? undefined,
              couponForRedirect
            );
          }
        }

        if (response.user.role === "ADMIN") {
          preloadAdminPanel();
        } else {
          preloadStudentPanel();
        }
        navigate(destination, { replace: true });
      } catch (error) {
        const message = error instanceof ApiError ? error.message : null;
        store.failSignIn(
          message ??
            (mode === "login"
              ? "E-mail, telefone ou senha inválidos, ou API indisponível."
              : "Não foi possível criar a conta. Verifique os dados e tente novamente.")
        );
      }
    },
    [navigate]
  );

  const submitRegisterOnboarding = useCallback(
    async (payload: WorkoutOnboardingSubmitPayload) => {
      const formData = new FormData();
      formData.set("name", payload.name);
      formData.set("email", payload.email ?? "");
      formData.set("phone", payload.phone ?? "");
      formData.set("document", payload.document ?? "");
      formData.set("password", payload.password ?? "");
      formData.set("gender", payload.gender);
      formData.set("birthDate", payload.birthDate);
      formData.set("objective", payload.objective);
      formData.set("level", levelLabel(payload.level));
      formData.set("daysPerWeek", String(payload.daysPerWeekNumber));
      formData.set("equipmentTags", payload.equipment.join(","));
      formData.set("billingType", payload.billingType ?? "UNDEFINED");
      formData.set("acceptTerms", payload.acceptTerms ? "true" : "");
      formData.set("acceptPrivacy", payload.acceptPrivacy ? "true" : "");
      await submitAuth("register", formData, "EMAIL");
    },
    [submitAuth]
  );

  const submitForgotPassword = useCallback(async (formData: FormData) => {
    const store = useAuthStore.getState();
    const payload = buildForgotPasswordPayload(formData);

    store.clearLoginMessages();

    try {
      const response = await apiPost<{ message: string }>("/auth/forgot-password", payload);
      store.setLoginSuccess(
        response.message ??
          "Se o e-mail ou telefone estiver cadastrado, você receberá instruções para redefinir sua senha."
      );
    } catch (error) {
      const message = error instanceof ApiError ? error.message : null;
      store.setLoginError(message ?? "Não foi possível processar a recuperação de senha neste momento.");
    }
  }, []);

  const submitResetPassword = useCallback(async (formData: FormData) => {
    const password = String(formData.get("password") ?? "");
    const confirmPassword = String(formData.get("confirmPassword") ?? "");
    const store = useAuthStore.getState();

    store.clearLoginMessages();

    if (!store.resetToken) {
      store.setLoginError("Link de redefinição inválido ou expirado.");
      return;
    }

    if (password !== confirmPassword) {
      store.setLoginError("As senhas informadas não coincidem.");
      return;
    }

    try {
      const response = await apiPost<{ message: string }>("/auth/reset-password", {
        token: store.resetToken,
        password
      });
      useAuthStore.setState({
        resetToken: null,
        loginError: null,
        loginSuccess:
          response.message ?? "Senha redefinida. Entre e conclua o pagamento para liberar o portal do aluno."
      });
    } catch (error) {
      const message = error instanceof ApiError ? error.message : null;
      store.setLoginError(message ?? "Não foi possível redefinir a senha neste momento.");
    }
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      phase,
      status,
      user,
      token,
      isAuthenticated,
      isTransitioning,
      transitionMessage,
      loginState,
      loginError,
      loginSuccess,
      resetToken,
      selectedPlanCode,
      setSelectedPlanCode,
      setResetToken,
      clearLoginMessages,
      logout,
      submitAuth,
      submitRegisterOnboarding,
      submitForgotPassword,
      submitResetPassword,
      enterAdminPreview,
      exitAdminPreview
    }),
    [
      phase,
      status,
      user,
      token,
      isAuthenticated,
      isTransitioning,
      transitionMessage,
      loginState,
      loginError,
      loginSuccess,
      resetToken,
      selectedPlanCode,
      setSelectedPlanCode,
      setResetToken,
      clearLoginMessages,
      logout,
      submitAuth,
      submitRegisterOnboarding,
      submitForgotPassword,
      submitResetPassword,
      enterAdminPreview,
      exitAdminPreview
    ]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return context;
}
