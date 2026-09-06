import assert from "node:assert/strict";
import {
  SUBSCRIPTION_PLAN_GOAL_DEFINITIONS,
  buildSubscriptionPlanGoalProgress,
  resolveSubscriptionPlanGoal
} from "./subscription-goals.js";

assert.equal(resolveSubscriptionPlanGoal("subscription_goal_start", 500, {}), 500);
assert.equal(resolveSubscriptionPlanGoal("subscription_goal_start", 500, { subscription_goal_start: "750" }), 750);

const def = SUBSCRIPTION_PLAN_GOAL_DEFINITIONS[0];
const progress = buildSubscriptionPlanGoalProgress(def, 600, { subscription_goal_start: "500" }, "Start");
assert.equal(progress.percent, 100);
assert.equal(progress.reached, true);
assert.equal(progress.planName, "Start");

console.log("subscription-goals.test.ts ok");
