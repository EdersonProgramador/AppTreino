import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  DEFAULT_PLATFORM_OWNER_EMAIL,
  isPlatformOwnerEmail,
  normalizePlatformOwnerEmail,
  resolvePlatformOwnerEmail
} from "./platform-owner.js";

describe("platform-owner", () => {
  it("normalizes email", () => {
    assert.equal(normalizePlatformOwnerEmail("  Ederson@Gmail.COM "), "ederson@gmail.com");
  });

  it("resolves default owner email", () => {
    assert.equal(resolvePlatformOwnerEmail(""), DEFAULT_PLATFORM_OWNER_EMAIL);
    assert.equal(resolvePlatformOwnerEmail("owner@test.com"), "owner@test.com");
  });

  it("matches configured owner email", () => {
    assert.equal(isPlatformOwnerEmail(DEFAULT_PLATFORM_OWNER_EMAIL), true);
    assert.equal(isPlatformOwnerEmail("other@test.com"), false);
    assert.equal(isPlatformOwnerEmail("Owner@test.com", "owner@test.com"), true);
  });
});
