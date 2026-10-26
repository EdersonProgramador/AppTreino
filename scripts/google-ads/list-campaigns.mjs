#!/usr/bin/env node
import { createGoogleAdsApi } from "./create-client.mjs";

const { customer, env } = createGoogleAdsApi();

const rows = await customer.query(`
  SELECT
    campaign.id,
    campaign.name,
    campaign.status,
    campaign.advertising_channel_type,
    metrics.impressions,
    metrics.clicks,
    metrics.cost_micros,
    metrics.conversions
  FROM campaign
  WHERE segments.date DURING LAST_30_DAYS
    AND campaign.status != 'REMOVED'
  ORDER BY metrics.cost_micros DESC
  LIMIT 50
`);

console.log(`Conta ${env.customerId} — campanhas (últimos 30 dias)\n`);

if (!rows.length) {
  console.log("Nenhuma campanha com dados no período (ou conta ainda sem veiculação).");
  process.exit(0);
}

for (const row of rows) {
  const c = row.campaign;
  const m = row.metrics;
  const cost = m?.cost_micros != null ? (Number(m.cost_micros) / 1_000_000).toFixed(2) : "0.00";
  console.log(
    [
      `#${c.id}`,
      c.status,
      c.advertising_channel_type,
      `"${c.name}"`,
      `imp ${m?.impressions ?? 0}`,
      `clk ${m?.clicks ?? 0}`,
      `R$ ${cost}`,
      `conv ${m?.conversions ?? 0}`
    ].join(" · ")
  );
}
