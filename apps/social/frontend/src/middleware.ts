import { NextRequest, NextResponse } from "next/server";

interface MiddlewareVerifyTokenBody {
  success?: boolean;
  logout?: boolean;
}

function cookieToken(req: NextRequest) {
  const raw = req.cookies.get("app-token") as { value?: string } | string | undefined;
  if (!raw) {
    return "";
  }
  return typeof raw === "string" ? raw : raw.value || "";
}

async function verifyToken(token: string) {
  try {
    const url = process.env.NEXT_PUBLIC_SERVER_URL + "/auth/verify-token";
    const response = await fetch(url, {
      headers: new Headers({
        "app-token": token
      })
    });
    const text = await response.text();
    return JSON.parse(text);
  } catch {
    return { logout: true };
  }
}

export function middleware(req: NextRequest) {
  const token = cookieToken(req);
  const path = req.nextUrl.pathname;
  const isAuthGate = path === "/auth/login" || path === "/auth/register";
  const isPublic =
    path.startsWith("/legal") ||
    path.startsWith("/auth/verify") ||
    path.startsWith("/auth/forgot") ||
    path.startsWith("/auth/reset");

  return verifyToken(token).then((response: MiddlewareVerifyTokenBody) => {
    const haveToken = response.success;

    if (haveToken && isAuthGate) {
      return NextResponse.redirect(new URL("/", req.url));
    }

    if (!haveToken && !isAuthGate && !isPublic) {
      return NextResponse.redirect(new URL("/auth/login", req.url));
    }

    return NextResponse.next();
  });
}

export const config = {
  matcher: [
    "/",
    "/chat",
    "/profile/:userID*",
    "/search/:UserName*",
    "/auth/login",
    "/auth/register",
    "/auth/verify",
    "/auth/forgot",
    "/auth/reset",
    "/onboarding",
    "/messages",
    "/messages/:userId*",
    "/reels",
    "/live",
    "/live/:id*",
    "/requests",
    "/admin",
    "/legal/:path*"
  ]
};
