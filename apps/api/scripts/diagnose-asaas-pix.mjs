/**
 * Testa API Asaas (conta + Pix) com as variáveis do .env local.
 * Uso: node apps/api/scripts/diagnose-asaas-pix.mjs
 */
import { config } from "dotenv";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
for (const path of [resolve(root, ".env"), resolve(root, "apps/api/.env")]) {
  if (existsSync(path)) config({ path, override: true });
}

const apiKey = process.env.ASAAS_API_KEY?.trim();
const apiUrl = (process.env.ASAAS_API_URL ?? "https://api-sandbox.asaas.com/v3").replace(/\/$/, "");

if (!apiKey) {
  console.error("ASAAS_API_KEY não definida no .env");
  process.exit(1);
}

const sandbox = apiUrl.includes("sandbox");

async function asaasGet(path) {
  const response = await fetch(`${apiUrl}${path}`, {
    headers: { access_token: apiKey, "Content-Type": "application/json" },
    signal: AbortSignal.timeout(20000)
  });
  const text = await response.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { raw: text };
  }
  return { ok: response.ok, status: response.status, json, text };
}

console.log(JSON.stringify({ apiUrl, sandbox, keyPrefix: `${apiKey.slice(0, 8)}…` }, null, 2));

const account = await asaasGet("/myAccount");
console.log("\n--- GET /myAccount ---");
console.log(JSON.stringify({ ok: account.ok, status: account.status, body: account.json }, null, 2));

const pixKeys = await asaasGet("/pix/addressKeys");
console.log("\n--- GET /pix/addressKeys ---");
console.log(JSON.stringify({ ok: pixKeys.ok, status: pixKeys.status, body: pixKeys.json }, null, 2));

if (!pixKeys.ok) {
  console.log("\nChaves Pix não listadas — confira permissões da integração ou conta.");
  process.exit(1);
}

const keys = pixKeys.json?.data ?? [];
if (keys.length === 0) {
  console.error("\nNenhuma chave Pix na conta vinculada a esta API key.");
  process.exit(1);
}

console.log(`\n${keys.length} chave(s) Pix encontrada(s). Teste de cobrança omitido (use sandbox ou apague manualmente).`);
