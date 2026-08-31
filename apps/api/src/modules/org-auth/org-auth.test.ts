import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { authorize, type OrgAuthContext } from "./authorize.js";

function ctx(partial: Partial<OrgAuthContext> & Pick<OrgAuthContext, "userId">): OrgAuthContext {
  return {
    isPlatformOperator: false,
    isPlatformAdmin: false,
    memberships: [],
    ...partial
  };
}

describe("org authorize", () => {
  it("platform operator has global access", () => {
    const result = authorize({
      ctx: ctx({ userId: "owner", isPlatformOperator: true }),
      permission: "organizations.create"
    });
    assert.equal(result, "ALLOW");
  });

  it("coach cannot access unassigned athlete", () => {
    const result = authorize({
      ctx: ctx({
        userId: "coach-1",
        memberships: [
          {
            organizationId: "org-1",
            unitId: "unit-1",
            role: "COACH",
            status: "ACTIVE"
          }
        ]
      }),
      permission: "training.update",
      organizationId: "org-1",
      unitId: "unit-1",
      athleteId: "athlete-2"
    });
    assert.equal(result, "DENY");
  });

  it("coach can access assigned athlete", () => {
    const result = authorize({
      ctx: ctx({
        userId: "coach-1",
        memberships: [
          {
            organizationId: "org-1",
            unitId: "unit-1",
            role: "COACH",
            status: "ACTIVE"
          }
        ]
      }),
      permission: "training.update",
      organizationId: "org-1",
      unitId: "unit-1",
      athleteId: "athlete-1",
      hasProfessionalAssignment: true
    });
    assert.equal(result, "ALLOW");
  });

  it("organization admin scoped to organization", () => {
    const result = authorize({
      ctx: ctx({
        userId: "admin-1",
        memberships: [
          {
            organizationId: "org-a",
            unitId: null,
            role: "ORGANIZATION_ADMIN",
            status: "ACTIVE"
          }
        ]
      }),
      permission: "units.create",
      organizationId: "org-a"
    });
    assert.equal(result, "ALLOW");

    const denied = authorize({
      ctx: ctx({
        userId: "admin-1",
        memberships: [
          {
            organizationId: "org-a",
            unitId: null,
            role: "ORGANIZATION_ADMIN",
            status: "ACTIVE"
          }
        ]
      }),
      permission: "units.create",
      organizationId: "org-b"
    });
    assert.equal(denied, "DENY");
  });

  it("athlete self scope allows own view permission context", () => {
    const result = authorize({
      ctx: ctx({
        userId: "athlete-1",
        memberships: [
          {
            organizationId: "org-1",
            unitId: "unit-1",
            role: "ATHLETE",
            status: "ACTIVE"
          }
        ]
      }),
      permission: "athletes.view",
      organizationId: "org-1",
      unitId: "unit-1",
      athleteId: "athlete-1"
    });
    assert.equal(result, "ALLOW");
  });
});

describe("individual access independence", () => {
  it("org layer does not require athlete membership for platform operator listing", () => {
    const result = authorize({
      ctx: ctx({ userId: "owner", isPlatformAdmin: true }),
      permission: "organizations.view"
    });
    assert.equal(result, "ALLOW");
  });
});
