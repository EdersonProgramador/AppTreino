import axios, { AxiosRequestConfig } from "axios";
import { GetServerSidePropsContext } from "next/types";
import { destroyCookie, parseCookies } from "nookies";
import Router from "next/router";
import { toast } from "react-toastify";

export const TOKEN_COOKIE = "app-token";
export const TOKEN_MAX_AGE = 60 * 60 * 24;

export const createConnection = axios.create({
  baseURL: `${process.env.NEXT_PUBLIC_SERVER_URL}`
});

function handleRequestError(error: unknown) {
  const data = (error as { response?: { data?: Record<string, unknown> } })?.response?.data;

  if (typeof window !== "undefined" && data?.logout) {
    toast.warning("Autenticação expirada. Faça login para continuar.");
    destroyCookie(null, TOKEN_COOKIE, { path: "/" });
    Router.push("/auth/login");
  }

  return {
    data: data ?? { success: false, message: "Falha na requisição." }
  };
}

export function api(ctx?: GetServerSidePropsContext) {
  const token = parseCookies(ctx ? ctx : null)[TOKEN_COOKIE];
  createConnection.defaults.headers["app-token"] = token || "";

  return {
    get: <T = any>(url: string, config?: AxiosRequestConfig) =>
      createConnection.get<T>(url, config).catch(handleRequestError),
    post: <T = any>(url: string, body?: unknown, config?: AxiosRequestConfig) =>
      createConnection.post<T>(url, body, config).catch(handleRequestError),
    put: <T = any>(url: string, body?: unknown, config?: AxiosRequestConfig) =>
      createConnection.put<T>(url, body, config).catch(handleRequestError),
    delete: <T = any>(url: string, config?: AxiosRequestConfig) =>
      createConnection.delete<T>(url, config).catch(handleRequestError)
  };
}
