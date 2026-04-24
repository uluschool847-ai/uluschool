import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { verifySessionToken } from "./lib/auth/session";

const SESSION_COOKIE = "ulu_session";
const ADMIN_PENDING_2FA_COOKIE = "ulu_admin_2fa_pending";
const ATTRIBUTION_MAX_AGE = 60 * 60 * 24 * 30;
const TOKEN_AUTH_API_PREFIXES = ["/api/alerts/test", "/api/reminders/send-due", "/api/cron/automation"] as const;
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

export async function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  const response = NextResponse.next();

  setAttributionCookies(request, response);

  // --- A/B Testing Middleware ---
  if (pathname === "/pricing") {
    let bucket = request.cookies.get("ab_pricing_bucket")?.value;
    if (!bucket) {
      bucket = Math.random() < 0.5 ? "A" : "B";
      response.cookies.set("ab_pricing_bucket", bucket, { path: "/" });
    }
    if (bucket === "B") {
      return NextResponse.rewrite(new URL("/pricing-v2", request.url));
    }
  }

  // --- Centralized RBAC & API Protection ---
  const isApiPath = pathname.startsWith("/api");
  const isAdminPath =
    pathname.startsWith("/admin") ||
    pathname.startsWith("/api/admin") ||
    pathname.startsWith("/portal/admin");
  const isPortalPath = pathname.startsWith("/portal") || pathname.startsWith("/api/portal");
  const isProtectedPath = isAdminPath || isPortalPath || isApiPath;

  // Public exceptions
  if (!isProtectedPath) return response;
  if (pathname === "/api/health") return response;
  if (pathname.startsWith("/api/auth/session")) return response;
  if (pathname.startsWith("/api/auth/sso/callback")) return response;

  // Token-protected machine endpoints may authenticate via Bearer token
  // and should reach the route-level token check without a session cookie.
  const isTokenProtectedApi = TOKEN_AUTH_API_PREFIXES.some((prefix) => pathname.startsWith(prefix));
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
        const hasPendingAdminTwoFactor = Boolean(request.cookies.get(ADMIN_PENDING_2FA_COOKIE)?.value);
        if (hasPendingAdminTwoFactor) {
          return NextResponse.redirect(new URL("/student-portal/verify-2fa", request.url));
        }
      }
      const loginUrl = new URL("/student-portal", request.url);
      loginUrl.searchParams.set("next", pathname);
      return NextResponse.redirect(loginUrl);
    }
    // 403 for UI: redirect to their base portal
    return NextResponse.redirect(new URL("/portal", request.url));
  };

  if (!session) {
    return denyAccess(401, "Unauthorized");
  }

  // --- Authenticated RBAC Checks ---

  // 1. Root /portal redirection (Fix for double-redirect)
  if (pathname === "/portal") {
    if (session.role === "ADMIN") return NextResponse.redirect(new URL("/admin", request.url));
    if (session.role === "TEACHER") return NextResponse.redirect(new URL("/portal/teacher", request.url));
    if (session.role === "STUDENT") return NextResponse.redirect(new URL("/portal/student", request.url));
    if (session.role === "PARENT") return NextResponse.redirect(new URL("/portal/parent", request.url));
  }

  // 2. Role-isolated route protection (deny by default for protected role areas)
  const role = session.role as AppRole;
  for (const rule of ROLE_ROUTE_RULES) {
    if (pathname.startsWith(rule.prefix) && !rule.roles.includes(role)) {
      return denyAccess(403, "Forbidden");
    }
  }

  // 3. Admin 2FA enforcement
  if (
    session.role === "ADMIN" &&
    process.env.ADMIN_REQUIRE_2FA !== "false" &&
    session.authMethod !== "sso" &&
    !session.mfaVerified &&
    !pathname.startsWith("/student-portal/verify-2fa")
  ) {
    if (isApiPath) return NextResponse.json({ error: "MFA required" }, { status: 403 });
    return NextResponse.redirect(new URL("/student-portal/verify-2fa", request.url));
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next|favicon.ico|.*\\..*).*)"],
};
