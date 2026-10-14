#!/usr/bin/env node
/**
 * Smoke test: tag Google Ads, bundle de produção e API.
 * Uso: node scripts/verify-atlly-marketing.mjs
 * Exit 0 = ok, 1 = falha crítica.
 */
const SITE = process.env.ATLLY_SITE_ORIGIN?.trim() || "https://www.atlly.com.br";
const API_HEALTH = process.env.ATLLY_API_HEALTH?.trim() || "https://api.atlly.com.br/health";
const TAG_ID = process.env.ATLLY_GOOGLE_ADS_TAG_ID?.trim() || "AW-18513371658";
const MIN_COMMIT_PREFIX = process.env.ATLLY_MIN_DEPLOY_SHA?.trim() || "";

const errors = [];
const warnings = [];

function ok(msg) {
  console.log(`✓ ${msg}`);
}

function warn(msg) {
  warnings.push(msg);
  console.warn(`⚠ ${msg}`);
}

function fail(msg) {
  errors.push(msg);
  console.error(`✗ ${msg}`);
}

async function fetchText(url) {
  const res = await fetch(url, { redirect: "follow" });
  return { res, text: await res.text(), url: res.url };
}

async function main() {
  console.log(`Verificando ATLLY marketing (${SITE})…\n`);

  const { res: healthRes, text: healthText } = await fetchText(API_HEALTH);
  if (!healthRes.ok) {
    fail(`API health HTTP ${healthRes.status}`);
  } else {
    try {
      const body = JSON.parse(healthText);
      if (body.status !== "ok") fail(`API health status: ${body.status}`);
      else ok(`API health (${body.database ?? "?"})`);
    } catch {
      fail("API health: resposta não é JSON");
    }
  }

  const { res: homeRes, text: html } = await fetchText(`${SITE}/`);
  if (!homeRes.ok) fail(`Home HTTP ${homeRes.status}`);
  else ok(`Home ${homeRes.url}`);

  if (!html.includes(TAG_ID)) fail(`Tag ${TAG_ID} ausente no HTML`);
  else ok(`Tag ${TAG_ID} no HTML`);

  if (!html.includes("googletagmanager.com/gtag/js")) fail("Script gtag.js ausente no HTML");
  else ok("Loader gtag.js referenciado");

  const bundleMatch = html.match(/\/assets\/index-([A-Za-z0-9_-]+)\.js/);
  if (!bundleMatch) {
    fail("Bundle JS principal não encontrado no HTML");
  } else {
    const bundlePath = `/assets/index-${bundleMatch[1]}.js`;
    const { res: bundleRes, text: bundle } = await fetchText(`${new URL(homeRes.url).origin}${bundlePath}`);
    if (!bundleRes.ok) fail(`Bundle HTTP ${bundleRes.status}`);
    else {
      ok(`Bundle ${bundlePath}`);
      if (!bundle.includes(TAG_ID)) warn(`Tag ${TAG_ID} não embutida no bundle (fallback de host pode aplicar)`);
      if (bundle.includes("google_ads_conversion_pending")) {
        warn(
          "Bundle dispara google_ads_conversion_pending — sem VITE_GOOGLE_ADS_CONVERSION_* (ok se conversão for URL /aluno)"
        );
      }
      const shaMatch = bundle.match(/VITE_VERCEL_GIT_COMMIT_SHA:"([^"]+)"/);
      if (shaMatch) {
        ok(`Deploy SHA ${shaMatch[1].slice(0, 7)}`);
        if (MIN_COMMIT_PREFIX && !shaMatch[1].startsWith(MIN_COMMIT_PREFIX)) {
          warn(`SHA ${shaMatch[1].slice(0, 7)} anterior ao mínimo esperado ${MIN_COMMIT_PREFIX}`);
        }
      }
      if (bundle.includes("VITE_GOOGLE_ADS_CONVERSION_PURCHASE:\"")) {
        ok("Rótulo VITE_GOOGLE_ADS_CONVERSION_PURCHASE presente no build");
      }
    }
  }

  const { text: ativarHtml } = await fetchText(`${SITE}/ativar`);
  if (!ativarHtml.includes(TAG_ID)) fail("Tag ausente em /ativar");
  else ok("Tag presente em /ativar");

  console.log("");
  if (warnings.length) {
    console.log(`Avisos (${warnings.length}):`);
    for (const w of warnings) console.log(`  - ${w}`);
    console.log("");
  }

  if (errors.length) {
    console.error(`Falhas (${errors.length}).`);
    process.exit(1);
  }

  console.log("Marketing smoke: OK");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
