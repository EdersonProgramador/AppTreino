#!/usr/bin/env node
/**
 * Gera JSON + TXT com URLs finais ATLLY para Google Ads / Adrails.
 * Uso: node scripts/generate-google-ads-campaign-pack.mjs
 */
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const outDir = path.join(root, "docs", "google-ads", "generated");

const pack = {
  generatedAt: new Date().toISOString(),
  customerId: "244-230-6941",
  customerIdDigits: "2442306941",
  googleTagId: "AW-18513371658",
  conversionUrlContains: "/aluno",
  siteOrigin: "https://www.atlly.com.br",
  notes: [
    "Criar campanhas pausadas; ativar após revisar conversão primária no Google Ads.",
    "Cupom GOOGLE15 deve existir no admin ATLLY antes de veicular com coupon= na URL.",
    "Adrails: colar performanceMaxFinalUrl como Final URL (PMax) ou equivalente Search."
  ],
  urls: {
    performanceMax: buildUrl("google_pmax", "atlly_pro_pmax_br", "paid"),
    search: buildUrl("google_search", "atlly_pro_search_br", "paid_search"),
    display: buildUrl("google_display", "atlly_pro_display_br", "display")
  },
  adrailsPrompts: {
    firstReview:
      "Review Google Ads account 2442306941 (ATLLY). List conversion actions for tag AW-18513371658, active campaigns, spend last 7 days.",
    createPMaxPaused:
      "Prepare a paused Performance Max campaign for Brazil, daily budget BRL 50, final URL from urls.performanceMax in docs/google-ads/generated/campaign-pack.json, optimize for primary conversion (page contains /aluno)."
  }
};

function buildUrl(_channel, campaign, medium) {
  const params = new URLSearchParams({
    plan: "PRO",
    coupon: "GOOGLE15",
    utm_source: "google",
    utm_medium: medium,
    utm_campaign: campaign
  });
  return `https://www.atlly.com.br/ativar?${params.toString()}`;
}

await fs.mkdir(outDir, { recursive: true });
const jsonPath = path.join(outDir, "campaign-pack.json");
const txtPath = path.join(outDir, "final-urls.txt");

await fs.writeFile(jsonPath, `${JSON.stringify(pack, null, 2)}\n`, "utf8");

const txt = [
  "# ATLLY — URLs finais (Google Ads / Adrails)",
  `# Gerado: ${pack.generatedAt}`,
  "",
  `Performance Max: ${pack.urls.performanceMax}`,
  `Search:          ${pack.urls.search}`,
  `Display:         ${pack.urls.display}`,
  "",
  `Customer ID: ${pack.customerId}`,
  `Tag: ${pack.googleTagId}`,
  `Conversão (URL): contém ${pack.conversionUrlContains}`,
  ""
].join("\n");

await fs.writeFile(txtPath, txt, "utf8");

console.log(`Wrote ${path.relative(root, jsonPath)}`);
console.log(`Wrote ${path.relative(root, txtPath)}`);
