import { GoogleAdsApi } from "google-ads-api";
import { loadGoogleAdsEnv } from "./load-env.mjs";

export function createGoogleAdsApi() {
  const env = loadGoogleAdsEnv({ requireRefreshToken: true });
  const api = new GoogleAdsApi({
    client_id: env.clientId,
    client_secret: env.clientSecret,
    developer_token: env.developerToken
  });

  const customer = api.Customer({
    customer_id: env.customerId,
    refresh_token: env.refreshToken,
    ...(env.loginCustomerId ? { login_customer_id: env.loginCustomerId } : {})
  });

  return { api, customer, env };
}
