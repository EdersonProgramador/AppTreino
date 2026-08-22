import { Response } from "express";

export function fail(response: Response, status: number, message: string) {
  return response.status(status).json({
    success: false,
    error: status >= 500,
    message
  });
}

export function unauthorized(response: Response, message = "Sessão expirada.") {
  return response.status(401).json({
    success: false,
    logout: true,
    message
  });
}
