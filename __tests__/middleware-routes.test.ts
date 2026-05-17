import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = process.cwd();
const APP_DIR = join(ROOT, "app");
const MIDDLEWARE_FILE = join(ROOT, "middleware.ts");

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const fullPath = join(dir, entry);
    const stats = statSync(fullPath);
    if (stats.isDirectory()) {
      return walk(fullPath);
    }
    return fullPath;
  });
}

function normalizeRoute(filePath: string) {
  const rel = relative(APP_DIR, filePath).replace(/\\/g, "/");
  const withoutLeaf = rel.replace(/\/(page|route)\.tsx?$|\/(page|route)\.ts$/, "");
  const withoutGroups = withoutLeaf.replace(/\([^/]+\)\//g, "");
  return `/${withoutGroups}`.replace(/\/+/g, "/");
}

const appRoutes = walk(APP_DIR)
  .filter((filePath) => /\/(page|route)\.tsx?$/.test(filePath.replace(/\\/g, "/")))
  .map(normalizeRoute);

const middlewareContent = readFileSync(MIDDLEWARE_FILE, "utf8");

function extractArrayStrings(arrayName: string) {
  const match = middlewareContent.match(
    new RegExp(`${arrayName}(?:\\s*:\\s*[^=]+)?[\\s\\S]*?=\\s*\\[([\\s\\S]*?)\\]`, "m"),
  );
  if (!match) return [] as string[];
  return [...match[1].matchAll(/"([^"]+)"/g)].map((item) => item[1]);
}

const rolePrefixes = [...middlewareContent.matchAll(/prefix:\s*"([^"]+)"/g)].map(
  (match) => match[1],
);
const tokenPrefixes = extractArrayStrings("TOKEN_AUTH_API_PREFIXES");
const activeProtectedPrefixes = extractArrayStrings("activeProtectedPrefixes");

describe("Middleware route matching", () => {
  it("every middleware matcher pattern corresponds to an existing route", () => {
    const prefixes = [...new Set([...rolePrefixes, ...tokenPrefixes, ...activeProtectedPrefixes])];
    const missing = prefixes.filter(
      (prefix) => !appRoutes.some((route) => route === prefix || route.startsWith(`${prefix}/`)),
    );

    expect(
      missing,
      missing
        .map((prefix) => `Middleware route/prefix has no matching route in app/: ${prefix}`)
        .join("\n"),
    ).toEqual([]);
  });

  it("no public route is accidentally protected by middleware", () => {
    const publicRoutes = appRoutes.filter(
      (route) =>
        ![...rolePrefixes, ...activeProtectedPrefixes].some(
          (prefix) => route === prefix || route.startsWith(`${prefix}/`),
        ),
    );
    const accidentallyProtected = publicRoutes.filter((route) =>
      activeProtectedPrefixes.some((prefix) => route === prefix || route.startsWith(`${prefix}/`)),
    );

    expect(
      accidentallyProtected,
      accidentallyProtected
        .map((route) => `Public route appears inside protected middleware prefixes: ${route}`)
        .join("\n"),
    ).toEqual([]);
  });

  it("every protected route group has a corresponding middleware rule", () => {
    const protectedRoutes = appRoutes
      .filter(
        (route) =>
          route.startsWith("/admin") ||
          route.startsWith("/portal") ||
          route.startsWith("/api/admin") ||
          route.startsWith("/api/teacher") ||
          route.startsWith("/api/student") ||
          route.startsWith("/api/parent"),
      )
      .filter((route) => !route.startsWith("/portal/login") && route !== "/portal");

    const uncovered = protectedRoutes.filter(
      (route) =>
        ![...rolePrefixes, ...activeProtectedPrefixes].some(
          (prefix) => route === prefix || route.startsWith(`${prefix}/`),
        ),
    );

    expect(
      uncovered,
      uncovered
        .map((route) => `Protected route has no middleware protection rule: ${route}`)
        .join("\n"),
    ).toEqual([]);
  });
});
