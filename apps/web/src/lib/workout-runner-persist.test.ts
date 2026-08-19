/**
 * @vitest-environment node
 * Relógios do treino devem continuar pelo wall clock durante background.
 */
import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { computeElapsed, computeRestRemaining } from "./workout-runner-persist.ts";

const realDateNow = Date.now;

afterEach(() => {
  Date.now = realDateNow;
});

describe("workout runner background clocks", () => {
  it("includes time elapsed while JavaScript timers are suspended", () => {
    Date.now = () => 100_000;
    assert.equal(
      computeElapsed({
        isRunning: true,
        isPaused: false,
        elapsedBase: 30,
        runningStartedAt: 90_000
      }),
      40
    );
  });

  it("keeps paused elapsed time frozen", () => {
    Date.now = () => 100_000;
    assert.equal(
      computeElapsed({
        isRunning: true,
        isPaused: true,
        elapsedBase: 30,
        runningStartedAt: 90_000
      }),
      30
    );
  });

  it("expires rest from its absolute end time", () => {
    Date.now = () => 100_000;
    assert.equal(computeRestRemaining(104_200), 5);
    assert.equal(computeRestRemaining(99_000), 0);
  });
});
