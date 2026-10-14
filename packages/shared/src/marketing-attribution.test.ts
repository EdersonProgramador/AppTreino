import assert from "node:assert/strict";
import { parseMarketingAttributionFromSearch } from "./marketing-attribution.js";

const parsed = parseMarketingAttributionFromSearch(
  "?utm_source=meta&utm_medium=paid_social&utm_campaign=pro_corredores",
  "/ativar"
);
assert.equal(parsed?.utmSource, "meta");
assert.equal(parsed?.utmMedium, "paid_social");
assert.equal(parsed?.utmCampaign, "pro_corredores");
assert.equal(parsed?.landingPath, "/ativar");
assert.equal(parseMarketingAttributionFromSearch("?plan=PRO", "/ativar"), null);

console.log("marketing-attribution.test.ts ok");
