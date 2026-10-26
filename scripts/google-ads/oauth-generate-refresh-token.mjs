#!/usr/bin/env node
/**
 * Abre OAuth no browser e imprime GOOGLE_ADS_REFRESH_TOKEN.
 * Pré-requisitos: GOOGLE_ADS_CLIENT_ID + GOOGLE_ADS_CLIENT_SECRET em scripts/google-ads/.env
 */
import http from "node:http";
import { OAuth2Client } from "google-auth-library";
import { loadGoogleAdsEnv } from "./load-env.mjs";

const PORT = Number(process.env.GOOGLE_ADS_OAUTH_PORT || 8721);
const REDIRECT_URI = `http://127.0.0.1:${PORT}/oauth2callback`;
const SCOPES = ["https://www.googleapis.com/auth/adwords"];

function openBrowser(url) {
  const start =
    process.platform === "win32"
      ? `start "" "${url}"`
      : process.platform === "darwin"
        ? `open "${url}"`
        : `xdg-open "${url}"`;
  import("node:child_process").then(({ exec }) => exec(start, () => {}));
}

function waitForAuthCode() {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      try {
        const url = new URL(req.url ?? "/", `http://127.0.0.1:${PORT}`);
        if (url.pathname !== "/oauth2callback") {
          res.writeHead(404);
          res.end("Not found");
          return;
        }
        const err = url.searchParams.get("error");
        if (err) {
          res.writeHead(400);
          res.end(`OAuth error: ${err}`);
          reject(new Error(err));
          server.close();
          return;
        }
        const code = url.searchParams.get("code");
        if (!code) {
          res.writeHead(400);
          res.end("Missing code");
          reject(new Error("Missing authorization code"));
          server.close();
          return;
        }
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
        res.end(
          "<html><body><p>Autorização OK. Volte ao terminal e copie o refresh token.</p></body></html>"
        );
        resolve(code);
        server.close();
      } catch (e) {
        reject(e);
        server.close();
      }
    });

    server.on("error", reject);
    server.listen(PORT, "127.0.0.1", () => {
      console.log(`Aguardando callback em ${REDIRECT_URI}`);
    });
  });
}

async function main() {
  const { clientId, clientSecret } = loadGoogleAdsEnv();
  const oauth = new OAuth2Client(clientId, clientSecret, REDIRECT_URI);

  const authUrl = oauth.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: SCOPES
  });

  console.log("\n1) Confirme no Google Cloud que o redirect URI está cadastrado:");
  console.log(`   ${REDIRECT_URI}\n`);
  console.log("2) Abrindo navegador para consentimento (scope: Google Ads)…\n");
  openBrowser(authUrl);

  const code = await waitForAuthCode();
  const { tokens } = await oauth.getToken(code);

  if (!tokens.refresh_token) {
    console.error(
      "Nenhum refresh_token retornado. Revogue o acesso em https://myaccount.google.com/permissions e rode de novo com prompt=consent."
    );
    process.exit(1);
  }

  console.log("\nAdicione ao scripts/google-ads/.env:\n");
  console.log(`GOOGLE_ADS_REFRESH_TOKEN=${tokens.refresh_token}\n`);
  console.log("(Opcional) GOOGLE_ADS_DEVELOPER_TOKEN=… se ainda não tiver.\n");
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
