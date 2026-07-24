import { UserRole } from "@prisma/client";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { verifySessionToken } from "./lib/auth/session";

const SESSION_COOKIE = "ulu_session";
const ATTRIBUTION_MAX_AGE = 60 * 60 * 24 * 30;

const TOKEN_AUTH_API_PREFIXES = [
  "/api/alerts/test",
  "/api/reminders/send-due",
  "/api/cron/automation",
] as const;

type AppRole = "ADMIN" | "TEACHER" | "STUDENT" | "PARENT";
const PUBLIC_ROUTES = [
  "/",
  "/fees",
  "/admissions",
  "/contact",
  "/about",
  "/teachers",
  "/results",
  "/blog",
  "/curriculum",
  "/subjects",
  "/enrol",
] as const;

const ROLE_ROUTE_RULES: Array<{ prefix: string; roles: readonly AppRole[] }> = [
  { prefix: "/admin", roles: ["ADMIN"] },
  { prefix: "/portal/teacher", roles: ["TEACHER"] },
  { prefix: "/portal/student", roles: ["STUDENT"] },
  { prefix: "/portal/parent", roles: ["PARENT"] },
];

function setAttributionCookies(request: NextRequest, response: NextResponse) {
  const search = request.nextUrl.searchParams;
  const mappings = ["utm_source", "utm_medium", "utm_campaign"] as const;

  for (const key of mappings) {
    const value = search.get(key);
    if (!value) continue;
    response.cookies.set(key, value, {
      path: "/",
      maxAge: ATTRIBUTION_MAX_AGE,
      sameSite: "lax",
      secure: (process.env.NODE_ENV ?? "development") === "production",
      httpOnly: false,
    });
  }

  const referer = request.headers.get("referer");
  if (referer) {
    response.cookies.set("referrer", referer, {
      path: "/",
      maxAge: ATTRIBUTION_MAX_AGE,
      sameSite: "lax",
      secure: (process.env.NODE_ENV ?? "development") === "production",
      httpOnly: false,
    });
  }
}

// Precise path matching: matches exactly the prefix or any sub-path of it
function matchesPrefix(pathname: string, prefix: string): boolean {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

function matchesAnyPrefix(pathname: string, prefixes: readonly string[]): boolean {
  return prefixes.some((prefix) => matchesPrefix(pathname, prefix));
}

export async function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;

  // --- Legacy Compatibility Redirects ---
  if (matchesPrefix(pathname, "/student-portal")) {
    if (matchesPrefix(pathname, "/student-portal/login")) {
      const newPath = pathname.replace(/^\/student-portal\/login/, "/portal/login");
      const redirectUrl = new URL(`${newPath}${request.nextUrl.search}`, request.url);
      return NextResponse.redirect(redirectUrl);
    }
    const newPath = pathname.replace(/^\/student-portal/, "/portal/student");
    const redirectUrl = new URL(`${newPath}${request.nextUrl.search}`, request.url);
    return NextResponse.redirect(redirectUrl);
  }

  const response = NextResponse.next();
  setAttributionCookies(request, response);

  // Define active route policies
  const isPortalLoginPath = matchesPrefix(pathname, "/portal/login");
  const isPortalSetupPath = matchesPrefix(pathname, "/portal/setup");
  const isPublicRoute = matchesAnyPrefix(pathname, PUBLIC_ROUTES);

  // To avoid catching dead prefixes like /api/v1 or /portal-old, only protect defined active zones
  const activeProtectedPrefixes = ["/admin", "/portal"];

  const isProtectedPath =
    matchesAnyPrefix(pathname, activeProtectedPrefixes) && !isPortalLoginPath && !isPortalSetupPath;
  const isApiPath = matchesPrefix(pathname, "/api");

  // Public exceptions
  if (!isProtectedPath || isPublicRoute) {
    // If it's a token-protected API, we still need to process it if it matches precisely
    const isTokenProtectedApi = matchesAnyPrefix(pathname, TOKEN_AUTH_API_PREFIXES);
    if (!isTokenProtectedApi) return response;
  }

  if (matchesPrefix(pathname, "/api/health")) return response;
  if (matchesPrefix(pathname, "/api/auth/session")) return response;
  if (matchesPrefix(pathname, "/api/auth/sso/callback")) return response;

  // Token-protected machine endpoints may authenticate via Bearer token
  const isTokenProtectedApi = matchesAnyPrefix(pathname, TOKEN_AUTH_API_PREFIXES);
  const hasBearerAuth = request.headers.get("authorization")?.startsWith("Bearer ");
  if (isTokenProtectedApi && hasBearerAuth) {
    return response;
  }

  const sessionToken = request.cookies.get(SESSION_COOKIE)?.value;
  const session = await verifySessionToken(sessionToken);

  // Helper for consistent error responses
  const denyAccess = (status: 401 | 403, error: string, reason?: "expired" | "invalid") => {
    if (isApiPath) {
      return NextResponse.json({ error }, { status });
    }
    if (status === 401) {
      const nextPath = `${pathname}${request.nextUrl.search}`;
      const loginUrl = new URL("/portal/login", request.url);
      if (reason) {
        loginUrl.searchParams.set("reason", reason);
      }
      loginUrl.searchParams.set("callbackUrl", nextPath);
      return NextResponse.redirect(loginUrl);
    }
    // 403 for UI: redirect to dedicated unauthorized page
    return NextResponse.redirect(new URL("/portal/unauthorized", request.url));
  };

  if (!session) {
    return denyAccess(401, "Unauthorized", "invalid");
  }

  if (!session.exp || session.exp <= Date.now()) {
    return denyAccess(401, "Session expired", "expired");
  }

  // --- Authenticated RBAC Checks ---

  // 1. Root /portal redirection (Fix for double-redirect)
  if (pathname === "/portal") {
    if (session.role === UserRole.ADMIN)
      return NextResponse.redirect(new URL("/admin", request.url));
    if (session.role === UserRole.TEACHER)
      return NextResponse.redirect(new URL("/portal/teacher", request.url));
    if (session.role === UserRole.STUDENT)
      return NextResponse.redirect(new URL("/portal/student", request.url));
    if (session.role === UserRole.PARENT)
      return NextResponse.redirect(new URL("/portal/parent", request.url));
  }

  // 2. Role-isolated route protection (deny by default for protected role areas)
  const role = session.role as AppRole;
  for (const rule of ROLE_ROUTE_RULES) {
    if (matchesPrefix(pathname, rule.prefix) && !rule.roles.includes(role)) {
      return denyAccess(403, "Forbidden");
    }
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next|favicon.ico|.*\\..*).*)"],
};
