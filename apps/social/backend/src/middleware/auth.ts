import { NextFunction, Request, Response } from "express";
import { prisma } from "../config";
import { unauthorized } from "../shared/http";
import { setCurrentUser } from "../shared/authUser";
import { verifyAuthToken } from "../shared/token";

export async function verifyToken(request: Request, response: Response, next: NextFunction) {
  const token = request.header("app-token") || "";

  if (!token) {
    return unauthorized(response);
  }

  try {
    const decoded = verifyAuthToken(token);

    const user = decoded.id
      ? await prisma.user.findUnique({
          where: { id: decoded.id },
          select: { id: true, email: true, role: true, suspended_at: true }
        })
      : await prisma.user.findFirst({
          where: { email: decoded.email },
          select: { id: true, email: true, role: true, suspended_at: true }
        });

    if (!user) {
      return unauthorized(response);
    }

    if (user.suspended_at) {
      return unauthorized(response, "Esta conta foi suspensa.");
    }

    setCurrentUser(request, { id: user.id, email: user.email, role: user.role });
    request.headers["current-user-email"] = user.email;
    next();
  } catch {
    return unauthorized(response);
  }
}
