import { User } from "@prisma/client";
import { prisma } from "../config";

function emailList(envKey: string) {
  return (process.env[envKey] || "")
    .split(",")
    .map(value => value.trim().toLowerCase())
    .filter(Boolean);
}

export function adminEmails() {
  return emailList("ADMIN_EMAILS");
}

export function isAdminEmail(email: string) {
  return adminEmails().includes(email.toLowerCase());
}

export function isVerifiedEmail(email: string) {
  return emailList("VERIFIED_EMAILS").includes(email.toLowerCase());
}

export async function syncAdminRole<T extends Pick<User, "id" | "email" | "role">>(user: T) {
  if (!isAdminEmail(user.email) || user.role === "admin") {
    return user;
  }

  return prisma.user.update({
    where: { id: user.id },
    data: { role: "admin" }
  });
}
