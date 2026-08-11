import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildProgramPublishReadiness,
  filterActiveBlockExercises,
  studentMatchesProgramTargetGender
} from "./cms-publication.utils.js";

describe("studentMatchesProgramTargetGender", () => {
  it("allows all genders when target is ALL", () => {
    assert.equal(studentMatchesProgramTargetGender("ALL", "MALE"), true);
    assert.equal(studentMatchesProgramTargetGender("ALL", null), true);
  });

  it("requires matching gender for targeted programs", () => {
    assert.equal(studentMatchesProgramTargetGender("FEMALE", "FEMALE"), true);
    assert.equal(studentMatchesProgramTargetGender("FEMALE", "MALE"), false);
    assert.equal(studentMatchesProgramTargetGender("FEMALE", null), false);
  });
});

describe("buildProgramPublishReadiness", () => {
  it("flags inactive modality and empty fichas", () => {
    const result = buildProgramPublishReadiness({
      daysCount: 1,
      modality: {
        isActive: false,
        deletedAt: null,
        name: "Crossfit"
      },
      days: [
        {
          dayNumber: 1,
          workoutBlock: {
            deletedAt: null,
            title: "WOD A",
            exercises: []
          }
        }
      ]
    });

    assert.equal(result.ready, false);
    assert.ok(result.issues.some((issue) => issue.includes("inativa")));
    assert.ok(result.issues.some((issue) => issue.includes("exercícios ativos")));
  });

  it("accepts a valid publishable program", () => {
    const result = buildProgramPublishReadiness({
      daysCount: 1,
      modality: {
        isActive: true,
        deletedAt: null,
        name: "Musculação"
      },
      days: [
        {
          dayNumber: 1,
          workoutBlock: {
            deletedAt: null,
            title: "Treino A",
            exercises: [{ exercise: { deletedAt: null, title: "Agachamento" } }]
          }
        }
      ]
    });

    assert.equal(result.ready, true);
    assert.deepEqual(result.issues, []);
  });
});

describe("filterActiveBlockExercises", () => {
  it("removes deleted exercises from the block payload", () => {
    const filtered = filterActiveBlockExercises([
      { exercise: { deletedAt: null } },
      { exercise: { deletedAt: new Date() } }
    ]);

    assert.equal(filtered.length, 1);
  });
});
