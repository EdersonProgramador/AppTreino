import assert from "node:assert/strict";
import test from "node:test";
import {
  calculateProgramEndDate,
  calculateSuggestedSessions,
  estimateProgramDurationDays,
  isProgramComplete,
  parseRepetitionRange
} from "./workout-program.utils.js";

test("separates calendar duration from planned sessions", () => {
  assert.equal(estimateProgramDurationDays({ years: 0, months: 0, weeks: 4, days: 0 }), 28);
  assert.equal(calculateSuggestedSessions(28, 3), 12);
});

test("adds calendar months without overflowing the target month", () => {
  const end = calculateProgramEndDate(
    new Date("2026-01-31T12:00:00.000Z"),
    { years: 0, months: 1, weeks: 0, days: 0 }
  );

  assert.equal(end.toISOString(), "2026-02-28T12:00:00.000Z");
});

test("supports completion by sessions, date, both or manual decision", () => {
  const base = {
    completedSessions: 12,
    plannedSessions: 12,
    plannedEndsAt: new Date("2026-08-01T00:00:00.000Z"),
    now: new Date("2026-08-02T00:00:00.000Z")
  };

  assert.equal(isProgramComplete({ ...base, completionMode: "BY_SESSIONS" }), true);
  assert.equal(isProgramComplete({ ...base, completionMode: "BY_DATE" }), true);
  assert.equal(isProgramComplete({ ...base, completionMode: "BOTH" }), true);
  assert.equal(isProgramComplete({ ...base, completionMode: "MANUAL" }), false);
});

test("does not invent repetitions for textual prescriptions", () => {
  assert.deepEqual(parseRepetitionRange("10-12"), { min: 10, max: 12 });
  assert.deepEqual(parseRepetitionRange("Até a falha"), { min: null, max: null });
});
