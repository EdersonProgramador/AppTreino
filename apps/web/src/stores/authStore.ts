import { create } from "zustand";
import type { AuthUser } from "@app-treino/shared";
import {
  TOKEN_KEY,
  USER_KEY,
  consumePostLoginDestination,
  homePathForRole,
  normalizeAuthUser,
  persistStoredUser,
  readStoredToken,
  readStoredUser
} from "../auth/session";
import type { AuthMode, PlanCode } from "../types/auth";
import { useUiPrefsStore } from "./uiPrefsStore";

/**
 * Auth transition phases — UI must not render app shells while in motion.
 * anonymous → signingIn → redirecting → authenticated
 * anonymous → restoring → redirecting? → authenticated
 */
export type AuthPhase =
  | "anonymous"
  | "restoring"
  | "signingIn"
  | "redirecting"
  | "authenticated";

type AuthStore = {
  phase: AuthPhase;
  user: AuthUser | null;
  token: string | null;
  loginError: string | null;
  loginSuccess: string | null;
  resetToken: string | null;
  selectedPlanCode: PlanCode | null;
  pendingDestination: string | null;

  setPhase: (phase: AuthPhase) => void;
  setLoginError: (message: string | null) => void;
  setLoginSuccess: (message: string | null) => void;
  setResetToken: (token: string | null) => void;
  setSelectedPlanCode: (plan: PlanCode | null) => void;
  clearLoginMessages: () => void;

  beginRestore: () => void;
  beginSignIn: () => void;
  beginRedirect: (destination: string) => void;
  completeRedirect: () => void;
  failSignIn: (message: string) => void;

  establishSession: (response: { user: AuthUser; token: string }) => string;
  /** Troca de token sem limpar a sessão (preview enter/exit). */
  switchSession: (response: { user: AuthUser; token: string }, destination: string) => void;
  clearSession: () => void;
};

const bootToken = readStoredToken();
const bootUser = bootToken ? readStoredUser() : null;

export const useAuthStore = create<AuthStore>((set) => ({
  phase: bootToken && bootUser ? "authenticated" : bootToken ? "restoring" : "anonymous",
  user: bootUser,
  token: bootToken,
  loginError: null,
  loginSuccess: null,
  resetToken: null,
  selectedPlanCode: null,
  pendingDestination: null,

  setPhase: (phase) => set({ phase }),
  setLoginError: (loginError) => set({ loginError }),
  setLoginSuccess: (loginSuccess) => set({ loginSuccess }),
  setResetToken: (resetToken) => set({ resetToken }),
  setSelectedPlanCode: (selectedPlanCode) => set({ selectedPlanCode }),
  clearLoginMessages: () => set({ loginError: null, loginSuccess: null }),

  beginRestore: () => set({ phase: "restoring" }),
  beginSignIn: () => {
    // Evita corrida: /me com token antigo pode limpar a sessão no meio do login.
    if (typeof window !== "undefined") {
      window.localStorage.removeItem(TOKEN_KEY);
      window.localStorage.removeItem(USER_KEY);
    }
    persistStoredUser(null);
    set({
      phase: "signingIn",
      loginError: null,
      loginSuccess: null,
      token: null,
      user: null,
      pendingDestination: null
    });
  },
  beginRedirect: (destination) =>
    set({
      phase: "redirecting",
      pendingDestination: destination
    }),
  completeRedirect: () =>
    set({
      phase: "authenticated",
      pendingDestination: null
    }),
  failSignIn: (message) => {
    persistStoredUser(null);
    if (typeof window !== "undefined") {
      window.localStorage.removeItem(TOKEN_KEY);
    }
    set({
      token: null,
      user: null,
      phase: "anonymous",
      loginError: message,
      pendingDestination: null
    });
  },

  establishSession: (response) => {
    const user = normalizeAuthUser(response.user);
    const destination = consumePostLoginDestination() ?? homePathForRole(user.role);
    window.localStorage.setItem(TOKEN_KEY, response.token);
    persistStoredUser(user);
    useUiPrefsStore.getState().setTheme("light");
    set({
      token: response.token,
      user,
      phase: "redirecting",
      pendingDestination: destination,
      loginError: null,
      selectedPlanCode: null
    });
    return destination;
  },

  switchSession: (response, destination) => {
    const user = normalizeAuthUser(response.user);
    window.localStorage.setItem(TOKEN_KEY, response.token);
    persistStoredUser(user);
    useUiPrefsStore.getState().setTheme("light");
    set({
      token: response.token,
      user,
      phase: "redirecting",
      pendingDestination: destination,
      loginError: null
    });
  },

  clearSession: () => {
    window.localStorage.removeItem(TOKEN_KEY);
    persistStoredUser(null);
    set({
      token: null,
      user: null,
      phase: "anonymous",
      pendingDestination: null
    });
  }
}));

/** Session credentials exist (may still be redirecting onto the role home). */
export function selectHasSession(state: AuthStore) {
  return Boolean(state.user && state.token);
}

export function selectIsAuthenticated(state: AuthStore) {
  return state.phase === "authenticated" && Boolean(state.user && state.token);
}

export function selectIsTransitioning(state: AuthStore) {
  return state.phase === "restoring" || state.phase === "signingIn" || state.phase === "redirecting";
}

export function selectAuthModeLabel(state: AuthStore): string {
  switch (state.phase) {
    case "restoring":
      return "Restaurando sua sessão...";
    case "signingIn":
      return "Validando acesso...";
    case "redirecting":
      return state.user?.role === "ADMIN" ? "Abrindo painel admin..." : "Abrindo seu painel...";
    default:
      return "Carregando...";
  }
}

export type { AuthMode, PlanCode };
