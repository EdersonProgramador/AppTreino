import assert from "node:assert/strict";
import {
  ATLLY_GOOGLE_ADS_TAG_ID,
  buildAtllyCampaignUrl,
  buildAtllyCampaignUrlPack,
  marketingAttributionFromAtllyCampaignUrl
} from "./atlly-paid-media.js";

const pmax = buildAtllyCampaignUrl({ planCode: "PRO", channel: "google_pmax" });
assert.match(pmax, /^https:\/\/www\.atlly\.com\.br\/ativar\?/);
assert.match(pmax, /utm_campaign=atlly_pro_pmax_br/);
assert.match(pmax, /utm_medium=paid/);

const pack = buildAtllyCampaignUrlPack({ planCode: "PRO" });
assert.equal(pack.tagId, ATLLY_GOOGLE_ADS_TAG_ID);
assert.match(pack.performanceMaxFinalUrl, /coupon=GOOGLE15/);

const attr = marketingAttributionFromAtllyCampaignUrl(pmax);
assert.equal(attr?.utmSource, "google");
assert.equal(attr?.landingPath, "/ativar");

console.log("atlly-paid-media.test.ts ok");
