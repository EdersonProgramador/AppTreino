import assert from "node:assert/strict";
import {
  ATLLY_GOOGLE_ADS_CUSTOMER_ID,
  ATLLY_GOOGLE_ADS_TAG_ID,
  formatGoogleAdsSendTo,
  isValidGoogleAdsConversionLabel,
  normalizeGoogleAdsCustomerId
} from "./google-ads.js";

assert.equal(formatGoogleAdsSendTo("AW-123456789", "AbCdEfGhIj"), "AW-123456789/AbCdEfGhIj");
assert.equal(formatGoogleAdsSendTo("AW-123456789", "AW-999/FullLabel"), "AW-999/FullLabel");
assert.equal(formatGoogleAdsSendTo(null, "AbCdEfGhIj"), null);
assert.equal(formatGoogleAdsSendTo("invalid", "AbCdEfGhIj"), null);

assert.equal(ATLLY_GOOGLE_ADS_CUSTOMER_ID, "244-230-6941");
assert.equal(ATLLY_GOOGLE_ADS_TAG_ID, "AW-18513371658");
const atllyCustomer = normalizeGoogleAdsCustomerId("244-230-6941");
assert.equal(atllyCustomer?.digits, "2442306941");
assert.equal(atllyCustomer?.formatted, "244-230-6941");
assert.equal(isValidGoogleAdsConversionLabel("AbCdEfGhIj"), true);
assert.equal(isValidGoogleAdsConversionLabel("<rótulo da compra>"), false);

console.log("google-ads.test.ts ok");
