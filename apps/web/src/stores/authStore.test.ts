/**
 * @vitest-environment node
 * Auth store phase machine — run with: npx tsx --test src/stores/authStore.test.ts
 */
import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";

const memory = new Map<string, string>();

(globalThis as { window?: unknown }).window = {
  localStorage: {
    getItem: (key: string) => memory.get(key) ?? null,
    setItem: (key: string, value: string) => {
      memory.set(key, value);
    },
    removeItem: (key: string) => {
      memory.delete(key);
    }
  }
};

const { useAuthStore, selectIsAuthenticated, selectIsTransitioning } = await import("./authStore.ts");

describe("authStore login phase machine", () => {
  beforeEach(() => {
    memory.clear();
    useAuthStore.setState({
      phase: "anonymous",
      user: null,
      token: null,
      loginError: null,
      loginSuccess: null,
      resetToken: null,
      selectedPlanCode: null,
      pendingDestination: null
    });
  });

  it("student establishSession goes to /aluno under redirecting", () => {
    const destination = useAuthStore.getState().establishSession({
      token: "tok-student",
      user: {
        id: "u1",
        name: "Aluno Teste",
        email: "teste@gmail.com",
        role: "USER"
      }
    });

    const state = useAuthStore.getState();
    assert.equal(destination, "/aluno");
    assert.equal(state.phase, "redirecting");
    assert.equal(state.pendingDestination, "/aluno");
    assert.equal(state.user?.role, "USER");
    assert.equal(selectIsTransitioning(state), true);
    assert.equal(selectIsAuthenticated(state), false);
    assert.equal(memory.get("app-treino-token"), "tok-student");
  });

  it("admin establishSession goes to /admin", () => {
    const destination = useAuthStore.getState().establishSession({
      token: "tok-admin",
      user: {
        id: "a1",
        name: "Admin",
        email: "admin@app.com",
        role: "ADMIN"
      }
    });
    assert.equal(destination, "/admin");
    assert.equal(useAuthStore.getState().pendingDestination, "/admin");
  });

  it("completeRedirect only then marks authenticated", () => {
    useAuthStore.getState().establishSession({
      token: "tok",
      user: { id: "u1", name: "A", email: "a@a.com", role: "USER" }
    });
    useAuthStore.getState().completeRedirect();
    const state = useAuthStore.getState();
    assert.equal(state.phase, "authenticated");
    assert.equal(selectIsAuthenticated(state), true);
    assert.equal(selectIsTransitioning(state), false);
  });

  it("failSignIn clears credentials and returns anonymous", () => {
    useAuthStore.getState().beginSignIn();
    useAuthStore.setState({
      token: "stale",
      user: { id: "x", name: "X", email: "x@x.com", role: "USER" }
    });
    useAuthStore.getState().failSignIn("E-mail ou senha inválidos.");
    const state = useAuthStore.getState();
    assert.equal(state.phase, "anonymous");
    assert.equal(state.token, null);
    assert.equal(state.user, null);
    assert.equal(state.loginError, "E-mail ou senha inválidos.");
  });

  it("clearSession removes persisted token", () => {
    memory.set("app-treino-token", "tok");
    useAuthStore.getState().establishSession({
      token: "tok",
      user: { id: "u1", name: "A", email: "a@a.com", role: "USER" }
    });
    useAuthStore.getState().clearSession();
    assert.equal(memory.get("app-treino-token"), undefined);
    assert.equal(memory.get("app-treino-user"), undefined);
    assert.equal(useAuthStore.getState().phase, "anonymous");
  });
});
