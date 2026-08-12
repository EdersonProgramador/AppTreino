import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode
} from "react";
import { useLocation, useNavigate } from "react-router-dom";
import type { AuthUser } from "@app-treino/shared";
import { ApiError, apiGet, apiPost, setUnauthorizedHandler } from "../api";
import type { AuthMode, PlanCode } from "../types/auth";
import type { WorkoutOnboardingSubmitPayload } from "../components/onboarding/WorkoutOnboarding";
import { levelLabel } from "../components/onboarding/onboarding.schema";
import { homePathForRole, paths } from "./paths";

type LoginState = "idle" | "submitting";

/** Single source of truth for what the UI may render. */
export type AuthStatus = "booting" | "anonymous" | "authenticated";

type AuthContextValue = {
  status: AuthStatus;
  user: AuthUser | null;
  token: string | null;
  isAuthenticated: boolean;
  loginState: LoginState;
  loginError: string | null;
  loginSuccess: string | null;
  resetToken: string | null;
  selectedPlanCode: PlanCode | null;
  setSelectedPlanCode: (plan: PlanCode | null) => void;
  setResetToken: (token: string | null) => void;
  clearLoginMessages: () => void;
  applySession: (response: { user: AuthUser; token: string }) => void;
  logout: () => void;
  submitAuth: (mode: AuthMode, formData: FormData, provider?: "EMAIL" | "GOOGLE") => Promise<void>;
  submitRegisterOnboarding: (payload: WorkoutOnboardingSubmitPayload) => Promise<void>;
  submitForgotPassword: (formData: FormData) => Promise<void>;
  submitResetPassword: (formData: FormData) => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

const TOKEN_KEY = "app-treino-token";

function readStoredToken() {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(TOKEN_KEY);
}

function isGuestPath(pathname: string) {
  return pathname === paths.home || pathname === paths.login || pathname === "";
}

function needsRoleRedirect(pathname: string, role: AuthUser["role"]) {
  if (isGuestPath(pathname)) return true;
  if (role === "ADMIN" && pathname.startsWith(paths.student)) return true;
  if (role === "USER" && pathname.startsWith(paths.admin)) return true;
  return false;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const location = useLocation();
  const locationRef = useRef(location.pathname);
  locationRef.current = location.pathname;

  const initialToken = readStoredToken();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [token, setToken] = useState<string | null>(() => initialToken);
  const [bootstrapping, setBootstrapping] = useState(() => Boolean(initialToken));
  const [loginState, setLoginState] = useState<LoginState>("idle");
  const [loginError, setLoginError] = useState<string | null>(null);
  const [loginSuccess, setLoginSuccess] = useState<string | null>(null);
  const [resetToken, setResetToken] = useState<string | null>(null);
  const [selectedPlanCode, setSelectedPlanCode] = useState<PlanCode | null>(null);

  /** True after applySession — skip boot redirect; only soft-validate /me. */
  const hydratedFromLoginRef = useRef(false);

  const status: AuthStatus = bootstrapping
    ? "booting"
    : user && token
      ? "authenticated"
      : "anonymous";

  const clearSessionLocal = useCallback(() => {
    window.localStorage.removeItem(TOKEN_KEY);
    hydratedFromLoginRef.current = false;
    setToken(null);
    setUser(null);
    setBootstrapping(false);
  }, []);

  const logout = useCallback(() => {
    clearSessionLocal();
    navigate(paths.home, { replace: true });
  }, [clearSessionLocal, navigate]);

  const enterAuthedArea = useCallback(
    (nextUser: AuthUser) => {
      if (needsRoleRedirect(locationRef.current, nextUser.role)) {
        navigate(homePathForRole(nextUser.role), { replace: true });
      }
    },
    [navigate]
  );

  const applySession = useCallback(
    (response: { user: AuthUser; token: string }) => {
      hydratedFromLoginRef.current = true;
      window.localStorage.setItem(TOKEN_KEY, response.token);
      setToken(response.token);
      setUser(response.user);
      setBootstrapping(false);
      navigate(homePathForRole(response.user.role), { replace: true });
    },
    [navigate]
  );

  useEffect(() => {
    setUnauthorizedHandler(() => {
      clearSessionLocal();
      navigate(paths.home, { replace: true });
    });

    return () => setUnauthorizedHandler(null);
  }, [clearSessionLocal, navigate]);

  useEffect(() => {
    if (!token) {
      hydratedFromLoginRef.current = false;
      setBootstrapping(false);
      setUser(null);
      return;
    }

    let cancelled = false;
    const fromLogin = hydratedFromLoginRef.current;

    if (!fromLogin) {
      setBootstrapping(true);
    }

    apiGet<{ user: AuthUser | null }>("/me", token)
      .then((response) => {
        if (cancelled) return;

        if (!response.user) {
          clearSessionLocal();
          navigate(paths.home, { replace: true });
          return;
        }

        setUser(response.user);
        setBootstrapping(false);

        if (!fromLogin) {
          enterAuthedArea(response.user);
        }
      })
      .catch(() => {
        if (cancelled) return;
        clearSessionLocal();
        navigate(paths.home, { replace: true });
      });

    return () => {
      cancelled = true;
    };
  }, [token, clearSessionLocal, navigate, enterAuthedArea]);

  const clearLoginMessages = useCallback(() => {
    setLoginError(null);
    setLoginSuccess(null);
  }, []);

  const submitAuth = useCallback(
    async (mode: AuthMode, formData: FormData, provider: "EMAIL" | "GOOGLE" = "EMAIL") => {
      setLoginError(null);
      setLoginSuccess(null);
      setLoginState("submitting");

      const name = String(formData.get("name") ?? "").trim();
      const email = String(formData.get("email") ?? "").trim().toLowerCase();
      const phone = String(formData.get("phone") ?? "").trim();
      const gender = String(formData.get("gender") ?? "").trim();
      const birthDate = String(formData.get("birthDate") ?? "").trim();
      const objective = String(formData.get("objective") ?? "").trim();
      const level = String(formData.get("level") ?? "").trim();
      const daysPerWeekRaw = String(formData.get("daysPerWeek") ?? "").trim();
      const equipmentTagsRaw = String(formData.get("equipmentTags") ?? "").trim();
      const identifier = String(formData.get("identifier") ?? "").trim();
      const password = String(formData.get("password") ?? "");
      const billingType = String(formData.get("billingType") ?? "UNDEFINED");
      const idToken = String(formData.get("idToken") ?? "").trim();
      const credential = String(formData.get("credential") ?? "").trim();
      const isCheckoutRegister = mode === "register" && selectedPlanCode;
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
                  gender: gender || undefined,
                  birthDate: birthDate || undefined,
                  objective: objective || undefined,
                  level: level || undefined,
                  daysPerWeek,
                  equipmentTags,
                  password,
                  planCode: selectedPlanCode,
                  billingType
                }
              : {
                  name,
                  email: email || undefined,
                  phone: phone || undefined,
                  gender: gender || undefined,
                  birthDate: birthDate || undefined,
                  objective: objective || undefined,
                  level: level || undefined,
                  daysPerWeek,
                  equipmentTags,
                  password,
                  provider
                };

      try {
        if (provider === "GOOGLE" && !idToken && !credential) {
          throw new ApiError(401, "Credencial do Google não recebida. Recarregue a página e tente novamente.");
        }

        const response = await apiPost<{ user: AuthUser; token: string; payment?: { paymentUrl?: string | null } }>(
          endpoint,
          payload
        );
        applySession(response);
        if (isCheckoutRegister && response.payment?.paymentUrl) {
          window.open(response.payment.paymentUrl, "_blank");
        }
        setSelectedPlanCode(null);
      } catch (error) {
        const message = error instanceof ApiError ? error.message : null;
        setLoginError(
          message ??
            (mode === "login"
              ? "E-mail, telefone ou senha inválidos, ou API indisponível."
              : "Não foi possível criar a conta. Verifique os dados e tente novamente.")
        );
      } finally {
        setLoginState("idle");
      }
    },
    [applySession, selectedPlanCode]
  );

  const submitRegisterOnboarding = useCallback(
    async (payload: WorkoutOnboardingSubmitPayload) => {
      const formData = new FormData();
      formData.set("name", payload.name);
      formData.set("email", payload.email ?? "");
      formData.set("phone", payload.phone ?? "");
      formData.set("password", payload.password ?? "");
      formData.set("gender", payload.gender);
      formData.set("birthDate", payload.birthDate);
      formData.set("objective", payload.objective);
      formData.set("level", levelLabel(payload.level));
      formData.set("daysPerWeek", String(payload.daysPerWeekNumber));
      formData.set("equipmentTags", payload.equipment.join(","));
      formData.set("billingType", payload.billingType ?? "UNDEFINED");
      await submitAuth("register", formData, "EMAIL");
    },
    [submitAuth]
  );

  const submitForgotPassword = useCallback(async (formData: FormData) => {
    const email = String(formData.get("email") ?? "").trim().toLowerCase();
    const phone = String(formData.get("phone") ?? "").trim();
    const identifier = String(formData.get("identifier") ?? "").trim();

    setLoginError(null);
    setLoginSuccess(null);
    setLoginState("submitting");

    try {
      const response = await apiPost<{ message: string }>("/auth/forgot-password", {
        email: email || (identifier.includes("@") ? identifier : undefined),
        phone: phone || (!identifier.includes("@") ? identifier : undefined)
      });
      setLoginSuccess(
        response.message ??
          "Se o e-mail ou telefone estiver cadastrado, você receberá instruções para redefinir sua senha."
      );
    } catch (error) {
      const message = error instanceof ApiError ? error.message : null;
      setLoginError(message ?? "Não foi possível processar a recuperação de senha neste momento.");
    } finally {
      setLoginState("idle");
    }
  }, []);

  const submitResetPassword = useCallback(
    async (formData: FormData) => {
      const password = String(formData.get("password") ?? "");
      const confirmPassword = String(formData.get("confirmPassword") ?? "");

      setLoginError(null);
      setLoginSuccess(null);

      if (!resetToken) {
        setLoginError("Link de redefinição inválido ou expirado.");
        return;
      }

      if (password !== confirmPassword) {
        setLoginError("As senhas informadas não coincidem.");
        return;
      }

      setLoginState("submitting");

      try {
        const response = await apiPost<{ message: string }>("/auth/reset-password", {
          token: resetToken,
          password
        });
        setResetToken(null);
        setLoginSuccess(
          response.message ?? "Senha redefinida com sucesso. Você já pode entrar com a nova senha."
        );
      } catch (error) {
        const message = error instanceof ApiError ? error.message : null;
        setLoginError(message ?? "Não foi possível redefinir a senha neste momento.");
      } finally {
        setLoginState("idle");
      }
    },
    [resetToken]
  );

  const value = useMemo<AuthContextValue>(
    () => ({
      status,
      user,
      token,
      isAuthenticated: status === "authenticated",
      loginState,
      loginError,
      loginSuccess,
      resetToken,
      selectedPlanCode,
      setSelectedPlanCode,
      setResetToken,
      clearLoginMessages,
      applySession,
      logout,
      submitAuth,
      submitRegisterOnboarding,
      submitForgotPassword,
      submitResetPassword
    }),
    [
      status,
      user,
      token,
      loginState,
      loginError,
      loginSuccess,
      resetToken,
      selectedPlanCode,
      clearLoginMessages,
      applySession,
      logout,
      submitAuth,
      submitRegisterOnboarding,
      submitForgotPassword,
      submitResetPassword
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
