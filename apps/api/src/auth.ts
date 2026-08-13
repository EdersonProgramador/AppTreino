import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import type { FastifyInstance, FastifyRequest } from "fastify";
import {
  can,
  hasAnyRole,
  hasRole,
  normalizeRole,
  type Permission,
  type UserRole
} from "@app-treino/shared";
import { prisma } from "./prisma.js";

const scrypt = promisify(scryptCallback);
const keyLength = 64;

export interface AuthTokenPayload {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  phone?: string | null;
  provider?: string;
  /** Sessão temporária: admin autenticado atuando como aluno. */
  previewMode?: boolean;
  adminId?: string;
  canReturnToAdmin?: boolean;
}

export function isAdminStudentPreview(user: AuthTokenPayload | null | undefined): boolean {
  return Boolean(
    user &&
      user.previewMode === true &&
      user.canReturnToAdmin === true &&
      typeof user.adminId === "string" &&
      user.adminId === user.id &&
      user.role === "USER"
  );
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString("hex");
  const derivedKey = (await scrypt(password, salt, keyLength)) as Buffer;

  return `${salt}:${derivedKey.toString("hex")}`;
}

export async function verifyPassword(password: string, passwordHash: string | null | undefined): Promise<boolean> {
  if (!passwordHash) {
    return false;
  }

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
  email?: string | null;
  role: UserRole;
  phone?: string | null;
  provider?: string | null;
}): AuthTokenPayload {
  return {
    id: user.id,
    name: user.name,
    email: user.email ?? user.phone ?? "",
    role: normalizeRole(user.role),
    phone: user.phone ?? null,
    provider: user.provider ?? "EMAIL"
  };
}

function httpError(statusCode: number, message: string) {
  const error = new Error(message) as Error & { statusCode: number };
  error.statusCode = statusCode;

  return error;
}

export function requestPathname(request: FastifyRequest) {
  return (request.url.split("?")[0] ?? request.url) || "/";
}

export async function getAuthUser(
  app: FastifyInstance,
  request: FastifyRequest
): Promise<AuthTokenPayload | null> {
  const authorization = request.headers.authorization;

  if (!authorization?.startsWith("Bearer ")) {
    return null;
  }

  let payload: AuthTokenPayload;

  try {
    payload = app.jwt.verify<AuthTokenPayload>(authorization.slice("Bearer ".length));
  } catch {
    return null;
  }

  const dbUser = await prisma.user.findUnique({
    where: { id: payload.id },
    select: {
      id: true,
      name: true,
      email: true,
      phone: true,
      role: true,
      status: true,
      deletedAt: true,
      provider: true
    }
  });

  if (!dbUser || dbUser.status !== "ACTIVE" || dbUser.deletedAt) {
    return null;
  }

  const dbRole = normalizeRole(dbUser.role);

  // Preview só é válido se o usuário no banco continua ADMIN e os claims batem.
  const validPreview =
    payload.previewMode === true &&
    payload.canReturnToAdmin === true &&
    typeof payload.adminId === "string" &&
    payload.adminId === dbUser.id &&
    payload.id === dbUser.id &&
    dbRole === "ADMIN";

  if (validPreview) {
    return {
      id: dbUser.id,
      name: dbUser.name,
      email: dbUser.email ?? dbUser.phone ?? "",
      role: "USER",
      phone: dbUser.phone ?? null,
      provider: dbUser.provider ?? "EMAIL",
      previewMode: true,
      adminId: dbUser.id,
      canReturnToAdmin: true
    };
  }

  // Nunca aceite claims de preview forjados.
  return {
    id: dbUser.id,
    name: dbUser.name,
    email: dbUser.email ?? dbUser.phone ?? "",
    role: dbRole,
    phone: dbUser.phone ?? null,
    provider: dbUser.provider ?? "EMAIL"
  };
}

export async function requireAuth(app: FastifyInstance, request: FastifyRequest) {
  const user = await getAuthUser(app, request);

  if (!user) {
    throw httpError(401, "Autenticação obrigatória.");
  }

  return user;
}

export async function requireRole(
  app: FastifyInstance,
  request: FastifyRequest,
  role: UserRole
) {
  const user = await requireAuth(app, request);

  if (!hasRole(user.role, role)) {
    throw httpError(403, "Perfil sem permissão para acessar este recurso.");
  }

  return user;
}

export async function requireAnyRole(
  app: FastifyInstance,
  request: FastifyRequest,
  roles: readonly UserRole[]
) {
  const user = await requireAuth(app, request);

  if (!hasAnyRole(user.role, roles)) {
    throw httpError(403, "Perfil sem permissão para acessar este recurso.");
  }

  return user;
}

export async function requirePermission(
  app: FastifyInstance,
  request: FastifyRequest,
  permission: Permission
) {
  const user = await requireAuth(app, request);

  if (!can(user.role, permission)) {
    throw httpError(403, "Perfil sem permissão para acessar este recurso.");
  }

  return user;
}

/** Gate helper for URL-prefix plugins (admin / user / student). */
export async function requirePathRole(
  app: FastifyInstance,
  request: FastifyRequest,
  prefix: string,
  role: UserRole
) {
  if (!requestPathname(request).startsWith(prefix)) {
    return null;
  }
  return requireRole(app, request, role);
}

export async function requirePathPermission(
  app: FastifyInstance,
  request: FastifyRequest,
  prefix: string,
  permission: Permission
) {
  if (!requestPathname(request).startsWith(prefix)) {
    return null;
  }
  return requirePermission(app, request, permission);
}
