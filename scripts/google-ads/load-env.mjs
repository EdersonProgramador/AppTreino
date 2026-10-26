import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

let loaded = false;

function loadEnvFiles() {
  if (loaded) return;
  loaded = true;
  const local = path.join(__dirname, ".env");
  if (fs.existsSync(local)) dotenv.config({ path: local });
  const repoRoot = path.resolve(__dirname, "../..");
  const rootLocal = path.join(repoRoot, ".env.google-ads.local");
  if (fs.existsSync(rootLocal)) dotenv.config({ path: rootLocal });
}

function required(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Variável ausente: ${name} (veja scripts/google-ads/env.example)`);
  return value;
}

function optionalDigits(name) {
  const raw = process.env[name]?.trim();
  if (!raw) return undefined;
  const digits = raw.replace(/\D/g, "");
  return digits || undefined;
}

export function loadGoogleAdsEnv(options = {}) {
  loadEnvFiles();

  const customerId = optionalDigits("GOOGLE_ADS_CUSTOMER_ID") ?? "2442306941";
  const base = {
    clientId: required("GOOGLE_ADS_CLIENT_ID"),
    clientSecret: required("GOOGLE_ADS_CLIENT_SECRET"),
    developerToken: required("GOOGLE_ADS_DEVELOPER_TOKEN"),
    customerId,
    loginCustomerId: optionalDigits("GOOGLE_ADS_LOGIN_CUSTOMER_ID")
  };

  if (options.requireRefreshToken) {
    return { ...base, refreshToken: required("GOOGLE_ADS_REFRESH_TOKEN") };
  }

  const refresh = process.env.GOOGLE_ADS_REFRESH_TOKEN?.trim();
  return { ...base, refreshToken: refresh || undefined };
}
