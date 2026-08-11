import { getApiBaseUrl } from "../api";

export const assetUrl = (path: string) => `${import.meta.env.BASE_URL}${path}`;
export const mediaUrl = (path?: string | null) => {
  if (!path) return "";
  if (/^https?:\/\//i.test(path)) return path;

  const trimmed = path.replace(/^\/+/, "");
  if (trimmed.startsWith("uploads/")) {
    return `${getApiBaseUrl().replace(/\/+$/, "")}/${trimmed}`;
  }

  return assetUrl(trimmed);
};
export const googleClientId = import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined;
