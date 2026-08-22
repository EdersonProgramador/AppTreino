import { NextFunction, Request, Response } from "express";
import { getCurrentUser } from "../shared/authUser";
import { fail } from "../shared/http";

export function requireAdmin(request: Request, response: Response, next: NextFunction) {
  if (getCurrentUser(request).role !== "admin") {
    return fail(response, 403, "Acesso restrito à moderação.");
  }

  next();
}
