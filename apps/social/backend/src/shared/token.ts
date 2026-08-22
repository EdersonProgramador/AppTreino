import jwt from "jsonwebtoken";

export const TOKEN_EXPIRES_IN = "1d";

interface AuthPayload {
  id?: string;
  email: string;
}

function secret() {
  const value = process.env.SECRET;
  if (!value) {
    throw new Error("SECRET is required");
  }
  return value;
}

export function signAuthToken(payload: { id: string; email: string }) {
  return jwt.sign(payload, secret(), { expiresIn: TOKEN_EXPIRES_IN });
}

export function verifyAuthToken(token: string): AuthPayload {
  return jwt.verify(token, secret()) as AuthPayload;
}
