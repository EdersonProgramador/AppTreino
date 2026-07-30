import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import type { FastifyInstance, FastifyRequest } from "fastify";
import type { UserRole } from "@app-treino/shared";

const scrypt = promisify(scryptCallback);
const keyLength = 64;

export interface AuthTokenPayload {
  id: string;
  name: string;
  email: string;
  role: UserRole;
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString("hex");
  const derivedKey = (await scrypt(password, salt, keyLength)) as Buffer;

  return `${salt}:${derivedKey.toString("hex")}`;
}

export async function verifyPassword(password: string, passwordHash: string): Promise<boolean> {
  const [salt, storedKey] = passwordHash.split(":");

  if (!salt || !storedKey) {
    return false;
  }

  const storedBuffer = Buffer.from(storedKey, "hex");
  const derivedKey = (await scrypt(password, salt, storedBuffer.length)) as Buffer;

  return timingSafeEqual(storedBuffer, derivedKey);
}

export function toAuthUser(user: {
  id: string;
  name: string;
  email: string;
  role: UserRole;
}): AuthTokenPayload {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role
  };
}

function httpError(statusCode: number, message: string) {
  const error = new Error(message) as Error & { statusCode: number };
  error.statusCode = statusCode;

  return error;
}

export async function getAuthUser(
  app: FastifyInstance,
  request: FastifyRequest
): Promise<AuthTokenPayload | null> {
  const authorization = request.headers.authorization;

  if (!authorization?.startsWith("Bearer ")) {
    return null;
  }

  try {
    return app.jwt.verify<AuthTokenPayload>(authorization.slice("Bearer ".length));
  } catch {
    return null;
  }
}

export async function requireAuth(app: FastifyInstance, request: FastifyRequest) {
  const user = await getAuthUser(app, request);

  if (!user) {
    throw httpError(401, "Autenticacao obrigatoria.");
  }

  return user;
}

export async function requireRole(
  app: FastifyInstance,
  request: FastifyRequest,
  role: UserRole
) {
  const user = await requireAuth(app, request);

  if (user.role !== role) {
    throw httpError(403, "Perfil sem permissao para acessar este recurso.");
  }

  return user;
}
