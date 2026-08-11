import axios, { type AxiosError, type AxiosInstance } from "axios";
import { ApiError, getApiBaseUrl, notifyUnauthorized } from "../api";

let client: AxiosInstance | null = null;
let authToken: string | null = null;

export function setAxiosAuthToken(token: string | null) {
  authToken = token;
}

export function getAxiosClient(): AxiosInstance {
  if (client) return client;

  client = axios.create({
    baseURL: getApiBaseUrl(),
    headers: { "Content-Type": "application/json" }
  });

  client.interceptors.request.use((config) => {
    if (authToken) {
      config.headers.Authorization = `Bearer ${authToken}`;
    }
    return config;
  });

  client.interceptors.response.use(
    (response) => response,
    (error: AxiosError<{ message?: string; issues?: Array<{ message: string }> }>) => {
      const status = error.response?.status ?? 0;
      if (status === 401) {
        notifyUnauthorized();
      }
      const data = error.response?.data;
      const message =
        data?.message ?? data?.issues?.[0]?.message ?? error.message ?? `API error: ${status}`;
      return Promise.reject(new ApiError(status, message));
    }
  );

  return client;
}

export async function axiosGet<T>(path: string, token?: string | null): Promise<T> {
  if (token !== undefined) setAxiosAuthToken(token);
  const { data } = await getAxiosClient().get<T>(path);
  return data;
}

export async function axiosPost<T>(path: string, body: unknown, token?: string | null): Promise<T> {
  if (token !== undefined) setAxiosAuthToken(token);
  const { data } = await getAxiosClient().post<T>(path, body);
  return data;
}

export async function axiosPut<T>(path: string, body: unknown, token?: string | null): Promise<T> {
  if (token !== undefined) setAxiosAuthToken(token);
  const { data } = await getAxiosClient().put<T>(path, body);
  return data;
}

export async function axiosDelete<T>(path: string, token?: string | null): Promise<T> {
  if (token !== undefined) setAxiosAuthToken(token);
  const { data } = await getAxiosClient().delete<T>(path);
  return data;
}
