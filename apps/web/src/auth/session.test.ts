import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  canAccessRoleRoute,
  homePathForRole,
  isGuestPath,
  isRoleHomePath,
  mustRedirectForRole,
  normalizeAuthUser,
  normalizeRole
} from "./session.ts";

describe("session role routing", () => {
  it("marks guest paths for redirect after login", () => {
  assert.equal(isGuestPath("/"), true);
  assert.equal(isGuestPath("/login"), true);
  assert.equal(isGuestPath("/baixar-app"), true);
  assert.equal(isGuestPath("/p/abc123"), true);
  assert.equal(isGuestPath("/aluno"), false);
  assert.equal(isGuestPath("/admin"), false);
  });

  it("student must leave /, /login and /admin", () => {
    assert.equal(mustRedirectForRole("/", "USER"), true);
    assert.equal(mustRedirectForRole("/login", "USER"), true);
    assert.equal(mustRedirectForRole("/admin", "USER"), true);
    assert.equal(mustRedirectForRole("/aluno", "USER"), false);
  });

  it("admin must leave /, /login and /aluno", () => {
    assert.equal(mustRedirectForRole("/", "ADMIN"), true);
    assert.equal(mustRedirectForRole("/login", "ADMIN"), true);
    assert.equal(mustRedirectForRole("/aluno", "ADMIN"), true);
    assert.equal(mustRedirectForRole("/admin", "ADMIN"), false);
  });

  it("role home detection", () => {
    assert.equal(isRoleHomePath("/aluno", "USER"), true);
    assert.equal(isRoleHomePath("/admin", "USER"), false);
    assert.equal(isRoleHomePath("/admin", "ADMIN"), true);
  });

  it("route ACL mirrors panels", () => {
    assert.equal(canAccessRoleRoute("USER", "USER"), true);
    assert.equal(canAccessRoleRoute("USER", "ADMIN"), false);
    assert.equal(canAccessRoleRoute("ADMIN", "ADMIN"), true);
    assert.equal(canAccessRoleRoute("ADMIN", "USER"), false);
  });

  it("normalizeAuthUser never escalates to ADMIN", () => {
    const user = normalizeAuthUser({
      id: "1",
      name: "Teste",
      email: "teste@gmail.com",
      role: "USER"
    });
    assert.equal(user.role, "USER");
    assert.equal(homePathForRole(normalizeRole(user.role)), "/aluno");
  });

  it("normalizeAuthUser keeps hardened admin preview claims", () => {
    const preview = normalizeAuthUser({
      id: "admin-1",
      name: "Admin",
      email: "admin@apptreino.com",
      role: "USER",
      previewMode: true,
      adminId: "admin-1",
      canReturnToAdmin: true
    });
    assert.equal(preview.previewMode, true);
    assert.equal(preview.canReturnToAdmin, true);
    assert.equal(preview.adminId, "admin-1");
    assert.equal(preview.role, "USER");
  });

  it("normalizeAuthUser drops incomplete preview claims", () => {
    const forged = normalizeAuthUser({
      id: "user-1",
      name: "Aluno",
      email: "aluno@apptreino.com",
      role: "USER",
      previewMode: true,
      canReturnToAdmin: false
    });
    assert.equal(forged.previewMode, undefined);
    assert.equal(forged.canReturnToAdmin, undefined);
  });
});
