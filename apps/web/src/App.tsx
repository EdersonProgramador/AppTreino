import { LogIn } from "lucide-react";
import { useEffect, useState } from "react";
import type { AuthUser } from "@app-treino/shared";
import { levelLabel } from "./components/onboarding/onboarding.schema";
import { ApiError, apiGet, apiPost, setUnauthorizedHandler } from "./api";
import { AdminView } from "./components/admin/AdminView";
import { LoginView } from "./components/auth/LoginView";
import { HomeView } from "./components/home/HomeView";
import { UserView } from "./components/student/UserView";
import type { WorkoutOnboardingSubmitPayload } from "./components/onboarding/WorkoutOnboarding";
import { assetUrl } from "./lib/urls";
import type { AuthMode, PlanCode, View } from "./types/auth";

export function App() {
  const [view, setView] = useState<View>("home");
  const [user, setUser] = useState<AuthUser | null>(null);
  const [token, setToken] = useState(() => window.localStorage.getItem("app-treino-token"));
  const [loginState, setLoginState] = useState<"idle" | "submitting">("idle");
  const [loginError, setLoginError] = useState<string | null>(null);
  const [loginSuccess, setLoginSuccess] = useState<string | null>(null);
  const [resetToken, setResetToken] = useState<string | null>(null);
  const [selectedPlanCode, setSelectedPlanCode] = useState<PlanCode | null>(null);

  useEffect(() => {
    setUnauthorizedHandler(() => {
      window.localStorage.removeItem("app-treino-token");
      setToken(null);
      setUser(null);
      setView("home");
    });

    return () => setUnauthorizedHandler(null);
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const tokenFromUrl = params.get("reset");

    if (!tokenFromUrl) {
      return;
    }

    setResetToken(tokenFromUrl);
    setView("login");

    const url = new URL(window.location.href);
    url.searchParams.delete("reset");
    window.history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);
  }, []);

  useEffect(() => {
    if (!token) return;

    apiGet<{ user: AuthUser | null }>("/me", token)
      .then((response) => {
        if (!response.user) {
          window.localStorage.removeItem("app-treino-token");
          setToken(null);
          return;
        }

        setUser(response.user);
        setView(response.user.role === "ADMIN" ? "admin" : "user");
      })
      .catch(() => {
        window.localStorage.removeItem("app-treino-token");
        setToken(null);
      });
  }, [token]);

  function applySession(response: { user: AuthUser; token: string }) {
    window.localStorage.setItem("app-treino-token", response.token);
    setToken(response.token);
    setUser(response.user);
    setView(response.user.role === "ADMIN" ? "admin" : "user");
  }

  function handleStart(planCode?: string) {
    setSelectedPlanCode(planCode === "monthly" || planCode === "annual" ? planCode : null);
    setView("login");
  }

  async function handleAuthSubmit(
    mode: AuthMode,
    formData: FormData,
    provider: "EMAIL" | "GOOGLE" = "EMAIL"
  ) {
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
  }

  async function handleRegisterOnboarding(payload: WorkoutOnboardingSubmitPayload) {
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
    await handleAuthSubmit("register", formData, "EMAIL");
  }

  async function handleForgotPassword(formData: FormData) {
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
  }

  async function handleResetPassword(formData: FormData) {
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
  }

  function handleLogout() {
    window.localStorage.removeItem("app-treino-token");
    setToken(null);
    setUser(null);
    setView("home");
  }

  return (
    <div className="ui-shell min-h-screen overflow-x-hidden">
      {!user && view !== "home" && (
        <header className="sticky top-0 z-20 grid min-h-[76px] grid-cols-[minmax(150px,1fr)_auto_minmax(150px,1fr)] items-center gap-6 border-b border-white/10 bg-ink/80 px-5 backdrop-blur-md sm:px-8 md:px-12">
          <button
            className="inline-flex items-center border-0 bg-transparent p-0"
            onClick={() => setView("home")}
            aria-label="Ir para início"
          >
            <img
              className="block h-auto w-[clamp(158px,16vw,218px)] rounded-lg drop-shadow-lg"
              src={assetUrl("assets/app-treino-logo.svg")}
              alt="App Treino"
            />
          </button>
          <nav className="hidden items-center gap-6 md:flex" aria-label="Navegação principal">
            <a
              className="text-sm font-bold text-sand-muted transition hover:-translate-y-px hover:text-sand"
              href="#recursos"
              onClick={() => setView("home")}
            >
              Recursos
            </a>
            <a
              className="text-sm font-bold text-sand-muted transition hover:-translate-y-px hover:text-sand"
              href="#planos"
              onClick={() => setView("home")}
            >
              Planos
            </a>
          </nav>
          <div className="flex items-center justify-end gap-3.5">
            <button
              className="inline-flex items-center gap-2 border-0 bg-transparent text-sm font-bold text-sand-muted transition hover:-translate-y-px hover:text-sand"
              onClick={() => setView("login")}
            >
              <LogIn size={18} />
              Entrar
            </button>
          </div>
        </header>
      )}

      {view === "home" && (
        <HomeView onStart={handleStart} onLogin={() => setView("login")} />
      )}
      {view === "login" && (
        <LoginView
          loading={loginState}
          error={loginError}
          success={loginSuccess}
          selectedPlanCode={selectedPlanCode}
          resetToken={resetToken}
          onSubmit={handleAuthSubmit}
          onRegisterOnboarding={handleRegisterOnboarding}
          onForgotPassword={handleForgotPassword}
          onResetPassword={handleResetPassword}
          onClearResetToken={() => setResetToken(null)}
        />
      )}
      {view === "admin" && <AdminView token={token} onLogout={handleLogout} />}
      {view === "user" && <UserView token={token} onLogout={handleLogout} />}
    </div>
  );
}
