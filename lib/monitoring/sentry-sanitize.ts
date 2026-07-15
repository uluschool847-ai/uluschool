import type { Breadcrumb, Event } from "@sentry/nextjs";

const FILTERED = "[Filtered]";
const MAX_SANITIZE_DEPTH = 32;
const SENSITIVE_ROUTE_PREFIXES = [
  "/enrol",
  "/contact",
  "/portal/login",
  "/portal/setup",
  "/api/auth",
  "/api/enrol",
  "/api/contact",
] as const;
const SENSITIVE_BREADCRUMB_CATEGORIES = new Set([
  "auth",
  "authentication",
  "contact",
  "enrol",
  "enrollment",
  "setup",
]);
const SUBJECT_NAME_KEY =
  /(?:student|parent|guardian|recipient)(?:first|last|full|display|legal)?name/;
const CONTEXTUAL_NAME_KEY = /^(?:first|last|full|display|legal)?name$/;
const SUBJECT_CONTAINER_KEY =
  /^(?:student|students|parent|parents|guardian|guardians|recipient|recipients)(?:data|details|profile|profiles)?$/;

type UnknownRecord = Record<string, unknown>;

function normalizeKey(key: string) {
  return key.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function isSensitiveKey(key: string, subjectNameContext: boolean) {
  const normalized = normalizeKey(key);

  return (
    normalized.includes("authorization") ||
    normalized.includes("cookie") ||
    normalized.includes("password") ||
    normalized.includes("token") ||
    normalized.includes("secret") ||
    normalized.includes("session") ||
    normalized.includes("backupcode") ||
    normalized.includes("email") ||
    normalized.includes("phone") ||
    normalized.includes("apikey") ||
    normalized.includes("querystring") ||
    normalized.includes("fullname") ||
    SUBJECT_NAME_KEY.test(normalized) ||
    normalized.endsWith("note") ||
    normalized.endsWith("notes") ||
    (subjectNameContext && CONTEXTUAL_NAME_KEY.test(normalized))
  );
}

function establishesSubjectNameContext(key: string) {
  return SUBJECT_CONTAINER_KEY.test(normalizeKey(key));
}

function isUnknownRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stripUrlQuery(value: string) {
  const queryIndex = value.indexOf("?");
  const fragmentIndex = value.indexOf("#");
  const indexes = [queryIndex, fragmentIndex].filter((index) => index >= 0);

  return indexes.length === 0 ? value : value.slice(0, Math.min(...indexes));
}

function pathnameFromUrl(value: string) {
  try {
    return new URL(value, "https://sentry.invalid").pathname;
  } catch {
    return stripUrlQuery(value);
  }
}

function isSensitiveRoute(value: string) {
  let pathname = pathnameFromUrl(value);

  try {
    pathname = decodeURIComponent(pathname);
  } catch {
    // Keep the encoded pathname and fail closed only on known route boundaries.
  }

  const normalizedPathname = pathname.toLowerCase();
  return SENSITIVE_ROUTE_PREFIXES.some(
    (prefix) => normalizedPathname === prefix || normalizedPathname.startsWith(`${prefix}/`),
  );
}

function isSensitiveBreadcrumbCategory(category: unknown) {
  if (typeof category !== "string") {
    return false;
  }

  return category
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .some((part) => SENSITIVE_BREADCRUMB_CATEGORIES.has(part));
}

function sanitizeValue(
  value: unknown,
  depth: number,
  activeObjects: WeakSet<object>,
  subjectNameContext = false,
): unknown {
  if (depth >= MAX_SANITIZE_DEPTH) {
    return FILTERED;
  }

  if (typeof value !== "object" || value === null) {
    return value;
  }

  if (activeObjects.has(value)) {
    return FILTERED;
  }

  activeObjects.add(value);

  try {
    if (Array.isArray(value)) {
      return value.map((item) => sanitizeValue(item, depth + 1, activeObjects, subjectNameContext));
    }

    const entries: Array<[string, unknown]> = [];

    for (const key of Object.keys(value)) {
      if (isSensitiveKey(key, subjectNameContext)) {
        entries.push([key, FILTERED]);
        continue;
      }

      let propertyValue: unknown;
      try {
        propertyValue = (value as UnknownRecord)[key];
      } catch {
        entries.push([key, FILTERED]);
        continue;
      }

      if (typeof propertyValue === "string" && normalizeKey(key).endsWith("url")) {
        entries.push([key, stripUrlQuery(propertyValue)]);
        continue;
      }

      entries.push([
        key,
        sanitizeValue(
          propertyValue,
          depth + 1,
          activeObjects,
          subjectNameContext || establishesSubjectNameContext(key),
        ),
      ]);
    }

    return Object.fromEntries(entries);
  } catch {
    return FILTERED;
  } finally {
    activeObjects.delete(value);
  }
}

function sanitizeRequest(event: UnknownRecord) {
  if (!isUnknownRecord(event.request)) {
    return;
  }

  const request = event.request;
  Reflect.deleteProperty(request, "query_string");

  if (typeof request.url !== "string" || !isSensitiveRoute(request.url)) {
    return;
  }

  Reflect.deleteProperty(request, "data");
  Reflect.deleteProperty(request, "body");
}

function sanitizeBreadcrumbRecord(breadcrumb: UnknownRecord) {
  if (isSensitiveBreadcrumbCategory(breadcrumb.category) && "message" in breadcrumb) {
    breadcrumb.message = FILTERED;
  }

  return breadcrumb;
}

export function sanitizeSentryEvent<T extends Event>(event: T): T {
  const cloned = sanitizeValue(event, 0, new WeakSet());
  if (!isUnknownRecord(cloned)) {
    return { message: FILTERED } as T;
  }

  Reflect.deleteProperty(cloned, "user");
  sanitizeRequest(cloned);

  if (Array.isArray(cloned.breadcrumbs)) {
    cloned.breadcrumbs = cloned.breadcrumbs.map((breadcrumb) =>
      isUnknownRecord(breadcrumb) ? sanitizeBreadcrumbRecord(breadcrumb) : breadcrumb,
    );
  }

  return cloned as T;
}

export function sanitizeSentryBreadcrumb(breadcrumb: Breadcrumb): Breadcrumb {
  const cloned = sanitizeValue(breadcrumb, 0, new WeakSet());
  if (!isUnknownRecord(cloned)) {
    return { message: FILTERED };
  }

  return sanitizeBreadcrumbRecord(cloned) as Breadcrumb;
}

export function parseSentrySampleRate(value: string | undefined): number {
  if (typeof value !== "string" || value.trim() === "") {
    return 0.05;
  }

  const sampleRate = Number(value);
  return Number.isFinite(sampleRate) && sampleRate >= 0 && sampleRate <= 1 ? sampleRate : 0.05;
}
