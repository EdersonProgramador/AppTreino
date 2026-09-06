import assert from "node:assert/strict";
import {
  SUBSCRIPTION_PLAN_GOAL_DEFINITIONS,
  buildSubscriptionPlanGoalProgress
} from "./subscription-goals.js";

const def = SUBSCRIPTION_PLAN_GOAL_DEFINITIONS[0];
const progress = buildSubscriptionPlanGoalProgress(def, 600, { subscription_goal_start: "500" }, "Start");
assert.equal(progress.percent, 100);
assert.equal(progress.reached, true);

console.log("subscription-goals.test.ts ok");
