import assert from "node:assert/strict";
import {
  GPS_SCALE_TIER_DEFINITIONS,
  buildGpsScaleTierProgress,
  buildGpsScaleTierProgressList,
  resolveActiveGpsScalePhase
} from "./gps-scale-tiers.js";

const phase1 = GPS_SCALE_TIER_DEFINITIONS[0];

assert.equal(buildGpsScaleTierProgress(phase1, 500, {}).status, "ok");
assert.equal(buildGpsScaleTierProgress(phase1, 850, {}).status, "warning");
assert.equal(buildGpsScaleTierProgress(phase1, 1200, {}).status, "critical");

const tiers = buildGpsScaleTierProgressList(1200, {});
assert.equal(tiers.length, 3);
assert.equal(tiers[0].limit, 1000);
assert.equal(tiers[1].limit, 5000);
assert.equal(tiers[2].limit, 10000);

assert.equal(resolveActiveGpsScalePhase(400, {}), "phase1");
assert.equal(resolveActiveGpsScalePhase(1500, {}), "phase2");
assert.equal(resolveActiveGpsScalePhase(6000, {}), "phase3");

console.log("gps-scale-tiers.test.ts ok");
