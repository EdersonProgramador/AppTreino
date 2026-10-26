#!/usr/bin/env node
import { createGoogleAdsApi } from "./create-client.mjs";

const { customer, env } = createGoogleAdsApi();

const rows = await customer.query(`
  SELECT
    conversion_action.id,
    conversion_action.name,
    conversion_action.status,
    conversion_action.type,
    conversion_action.category,
    conversion_action.primary_for_goal,
    conversion_action.tag_snippets
  FROM conversion_action
  WHERE conversion_action.status != 'REMOVED'
  ORDER BY conversion_action.name
`);

console.log(`Conta ${env.customerId} — ações de conversão\n`);

for (const row of rows) {
  const a = row.conversion_action;
  const primary = a.primary_for_goal ? "PRIMARY" : "secondary";
  console.log(`#${a.id} · ${a.status} · ${a.type} · ${primary} · "${a.name}"`);
}
