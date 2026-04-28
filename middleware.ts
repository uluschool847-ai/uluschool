import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { getPortalDashboardPath, getPortalLoginPath, verifySessionToken } from "./lib/auth/session";

const SESSION_COOKIE = "ulu_session";
const ADMIN_PENDING_2FA_COOKIE = "ulu_admin_2fa_pending";
const ATTRIBUTION_MAX_AGE = 60 * 60 * 24 * 30;

const TOKEN_AUTH_API_PREFIXES = [
  "/api/alerts/test",
  "/api/reminders/send-due",
  "/api/cron/automation",
] as const;

type AppRole = "ADMIN" | "TEACHER" | "STUDENT" | "PARENT";

const ROLE_ROUTE_RULES: Array<{ prefix: string; roles: readonly AppRole[] }> = [
  { prefix: "/admin", roles: ["ADMIN"] },
  { prefix: "/api/admin", roles: ["ADMIN"] },
  { prefix: "/portal/admin", roles: ["ADMIN"] },
  { prefix: "/portal/teacher", roles: ["TEACHER"] },
  { prefix: "/api/teacher", roles: ["TEACHER"] },
  { prefix: "/portal/student", roles: ["STUDENT"] },
  { prefix: "/api/student", roles: ["STUDENT"] },
  { prefix: "/portal/parent", roles: ["PARENT"] },
  { prefix: "/api/parent", roles: ["PARENT"] },
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
      secure: process.env.NODE_ENV === "production",
      httpOnly: false,
    });
  }

  const referer = request.headers.get("referer");
  if (referer) {
    response.cookies.set("referrer", referer, {
      path: "/",
      maxAge: ATTRIBUTION_MAX_AGE,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
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
  const isAdminPath = matchesAnyPrefix(pathname, ["/admin", "/api/admin", "/portal/admin"]);
  
  // To avoid catching dead prefixes like /api/v1 or /portal-old, only protect defined active zones
  const activeProtectedPrefixes = [
    "/admin", "/portal", "/api/admin", "/api/teacher", "/api/student", "/api/parent", "/api/portal"
  ];
  
  const isProtectedPath = matchesAnyPrefix(pathname, activeProtectedPrefixes) && !isPortalLoginPath;
  const isApiPath = matchesPrefix(pathname, "/api");

  // Public exceptions
  if (!isProtectedPath) {
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
  const denyAccess = (status: 401 | 403, error: string) => {
    if (isApiPath) {
      return NextResponse.json({ error }, { status });
    }
    if (status === 401) {
      if (isAdminPath) {
        const hasPendingAdminTwoFactor = Boolean(
          request.cookies.get(ADMIN_PENDING_2FA_COOKIE)?.value,
        );
        if (hasPendingAdminTwoFactor) {
          const nextPath = `${pathname}${request.nextUrl.search}`;
          const nextParam = nextPath ? `?next=${encodeURIComponent(nextPath)}` : "";
          return NextResponse.redirect(new URL(`/portal/login/verify-2fa${nextParam}`, request.url));
        }
      }
      const nextPath = `${pathname}${request.nextUrl.search}`;
      const loginUrl = new URL(getPortalLoginPath(nextPath), request.url);
      return NextResponse.redirect(loginUrl);
    }
    // 403 for UI: redirect to dedicated unauthorized page
    return NextResponse.redirect(new URL("/portal/unauthorized", request.url));
  };

  if (!session) {
    return denyAccess(401, "Unauthorized");
  }

  // --- Authenticated RBAC Checks ---

  // 1. Root /portal redirection (Fix for double-redirect)
  if (pathname === "/portal") {
    if (session.role === "ADMIN") return NextResponse.redirect(new URL("/admin", request.url));
    if (session.role === "TEACHER")
      return NextResponse.redirect(new URL("/portal/teacher", request.url));
    if (session.role === "STUDENT")
      return NextResponse.redirect(new URL("/portal/student", request.url));
    if (session.role === "PARENT")
      return NextResponse.redirect(new URL("/portal/parent", request.url));
  }

  // 2. Role-isolated route protection (deny by default for protected role areas)
  const role = session.role as AppRole;
  for (const rule of ROLE_ROUTE_RULES) {
    if (matchesPrefix(pathname, rule.prefix) && !rule.roles.includes(role)) {
      return denyAccess(403, "Forbidden");
    }
  }

  // 3. Admin 2FA enforcement
  if (
    session.role === "ADMIN" &&
    process.env.ADMIN_REQUIRE_2FA !== "false" &&
    session.authMethod !== "sso" &&
    !session.mfaVerified &&
    !matchesPrefix(pathname, "/portal/login/verify-2fa")
  ) {
    if (isApiPath) return NextResponse.json({ error: "MFA required" }, { status: 403 });
    const nextPath = `${pathname}${request.nextUrl.search}`;
    const nextParam = nextPath ? `?next=${encodeURIComponent(nextPath)}` : "";
    return NextResponse.redirect(new URL(`/portal/login/verify-2fa${nextParam}`, request.url));
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next|favicon.ico|.*\\..*).*)"],
};
