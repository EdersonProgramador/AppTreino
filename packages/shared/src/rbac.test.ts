import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  can,
  canAccessPanel,
  hasRole,
  homePathForRole,
  normalizeRole,
  permissionsFor
} from "./rbac.ts";

describe("RBAC normalizeRole", () => {
  it("keeps ADMIN explicit and fail-closes everything else to USER", () => {
    assert.equal(normalizeRole("ADMIN"), "ADMIN");
    assert.equal(normalizeRole("USER"), "USER");
    assert.equal(normalizeRole("admin"), "USER");
    assert.equal(normalizeRole(undefined), "USER");
    assert.equal(normalizeRole(null), "USER");
  });
});

describe("RBAC panel access", () => {
  it("students never access admin panel", () => {
    assert.equal(canAccessPanel("USER", "admin"), false);
    assert.equal(canAccessPanel("USER", "student"), true);
    assert.equal(can("USER", "admin_panel:access"), false);
    assert.equal(can("USER", "student_panel:access"), true);
  });

  it("admins never access student panel shell", () => {
    assert.equal(canAccessPanel("ADMIN", "admin"), true);
    assert.equal(canAccessPanel("ADMIN", "student"), false);
    assert.equal(can("ADMIN", "admin_panel:access"), true);
  });
});

describe("RBAC home paths", () => {
  it("routes USER to /aluno and ADMIN to /admin", () => {
    assert.equal(homePathForRole("USER"), "/aluno");
    assert.equal(homePathForRole("ADMIN"), "/admin");
    assert.equal(homePathForRole("garbage" as never), "/aluno");
  });
});

describe("RBAC role helpers", () => {
  it("hasRole is exact after normalize", () => {
    assert.equal(hasRole("USER", "USER"), true);
    assert.equal(hasRole("USER", "ADMIN"), false);
    assert.equal(hasRole("ADMIN", "ADMIN"), true);
  });

  it("USER permissions exclude admin_panel", () => {
    const perms = permissionsFor("USER");
    assert.ok(perms.includes("student_panel:access"));
    assert.ok(!perms.includes("admin_panel:access"));
  });
});
