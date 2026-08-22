import { Request } from "express";

export interface CurrentUser {
  id: string;
  email: string;
  role: string;
}

type RequestWithUser = Request & { currentUser?: CurrentUser };

export function setCurrentUser(request: Request, user: CurrentUser) {
  (request as RequestWithUser).currentUser = user;
}

export function getCurrentUser(request: Request): CurrentUser {
  const user = (request as RequestWithUser).currentUser;
  if (!user) {
    throw new Error("Usuário autenticado ausente.");
  }
  return user;
}
