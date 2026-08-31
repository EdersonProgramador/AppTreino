import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { mergePublishedPrograms } from "./org-workouts.utils.js";

describe("mergePublishedPrograms", () => {
  it("keeps platform programs and adds org programs without duplicates", () => {
    const platform = [
      { id: "p1", sortOrder: 1, publishedAt: null, createdAt: new Date("2026-01-01") },
      { id: "p2", sortOrder: 2, publishedAt: null, createdAt: new Date("2026-01-02") }
    ] as never[];
    const org = [{ id: "p2", sortOrder: 3, publishedAt: null, createdAt: new Date("2026-01-03") }, { id: "p3", sortOrder: 1, publishedAt: null, createdAt: new Date("2026-01-04") }] as never[];

    const merged = mergePublishedPrograms(platform, org);
    assert.equal(merged.length, 3);
    assert.deepEqual(merged.map((item) => item.id), ["p1", "p3", "p2"]);
  });
});
