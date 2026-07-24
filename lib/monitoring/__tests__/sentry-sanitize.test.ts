import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { Event } from "@sentry/nextjs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  parseSentrySampleRate,
  sanitizeSentryBreadcrumb,
  sanitizeSentryEvent,
} from "@/lib/monitoring/sentry-sanitize";

const sentryInitMock = vi.hoisted(() => vi.fn());

vi.mock("@sentry/nextjs", () => ({
  captureRouterTransitionStart: vi.fn(),
  init: sentryInitMock,
}));

const FILTERED = "[Filtered]";
const FILE_ROUTE_FAMILIES = [
  { label: "private", route: "/api/files" },
  { label: "public", route: "/api/public-files" },
] as const;

function encodeFileRoutePrefix(route: string, passes: number) {
  let encoded = [...route.slice(1)]
    .map((character) => `%${character.charCodeAt(0).toString(16).padStart(2, "0")}`)
    .join("");

  for (let pass = 1; pass < passes; pass += 1) {
    encoded = encodeURIComponent(encoded);
  }

  return `/${encoded}`;
}

function encodeWholeFileRoutePrefix(route: string, passes: number) {
  let encoded = [...route]
    .map((character) => `%${character.charCodeAt(0).toString(16).padStart(2, "0")}`)
    .join("");

  for (let pass = 1; pass < passes; pass += 1) {
    encoded = encodeURIComponent(encoded);
  }

  return encoded;
}

const MALFORMED_FILE_ROUTE_CASES = FILE_ROUTE_FAMILIES.flatMap((family) =>
  [
    {
      label: "raw trailing percent",
      pathname: (token: string) => `${family.route}/${token}%`,
      preservesFamily: true,
    },
    {
      label: "malformed non-hex percent sequence",
      pathname: (token: string) => `${family.route}/${token}%GG`,
      preservesFamily: true,
    },
    {
      label: "malformed UTF-8 percent sequence",
      pathname: (token: string) => `${family.route}/${token}%E0%A4%A`,
      preservesFamily: true,
    },
    {
      label: "partially encoded separator with a malformed token",
      pathname: (token: string) => `${family.route.replace("/api/", "/api%2F")}/${token}%E0%A4%A`,
      preservesFamily: true,
    },
    ...[1, 2, 3, 4, 5].map((passes) => ({
      label: `${passes}-pass encoded route prefix`,
      pathname: (token: string) => `${encodeFileRoutePrefix(family.route, passes)}/${token}`,
      preservesFamily: passes <= 4,
    })),
  ].flatMap((candidate, candidateIndex) =>
    (["path-only", "absolute"] as const).map((requestForm) => {
      const token = `SIGNED_${family.label.toUpperCase()}_FILE_TOKEN_${candidateIndex}_${requestForm.toUpperCase().replace("-", "_")}`;
      const pathname = candidate.pathname(token);
      const requestUrl =
        requestForm === "absolute" ? `https://school.example${pathname}` : pathname;
      const expectedRoute = candidate.preservesFamily
        ? requestForm === "absolute"
          ? `https://school.example${family.route}/:token`
          : `${family.route}/:token`
        : FILTERED;

      return {
        label: `${family.label} ${candidate.label} in a ${requestForm} route`,
        requestUrl: `${requestUrl}?download=${token}`,
        transaction: `GET ${requestUrl}?download=${token}`,
        token,
        expectedRequestUrl: expectedRoute,
        expectedTransaction: `GET ${expectedRoute}`,
      };
    }),
  ),
);
const ENCODED_LEADING_FILE_ROUTE_CASES = FILE_ROUTE_FAMILIES.flatMap((family) =>
  [1, 2, 3, 4, 5].map((passes) => {
    const token = `SIGNED_${family.label.toUpperCase()}_LEADING_SEPARATOR_TOKEN_${passes}`;
    const route = `${encodeWholeFileRoutePrefix(family.route, passes)}/${token}`;
    const expectedRoute = passes <= 4 ? `${family.route}/:token` : FILTERED;

    return {
      label: `${family.label} route with a ${passes}-pass encoded leading separator`,
      token,
      transaction: `DELETE ${route}?download=${token}`,
      expectedTransaction: `DELETE ${expectedRoute}`,
    };
  }),
);
const UNPARSABLE_ABSOLUTE_FILE_ROUTE_CASES = FILE_ROUTE_FAMILIES.map((family) => {
  const token = `SIGNED_${family.label.toUpperCase()}_UNPARSABLE_ABSOLUTE_TOKEN`;
  const requestUrl = `https://[invalid-host${family.route}/${token}%`;

  return {
    label: `${family.label} route in an unparseable absolute URL`,
    requestUrl: `${requestUrl}?download=${token}`,
    token,
    transaction: `PATCH ${requestUrl}?download=${token}`,
  };
});
const GENERIC_FILE_URL_CASES = [
  {
    category: "fetch",
    expectedUrl: "/api/files/:token",
    label: "relative private-file route",
    token: "GENERIC_RELATIVE_PRIVATE_FILE_TOKEN",
    url: "/api/files/GENERIC_RELATIVE_PRIVATE_FILE_TOKEN?download=GENERIC_RELATIVE_PRIVATE_FILE_TOKEN",
  },
  {
    category: "xhr",
    expectedUrl: "https://school.example/api/public-files/:token",
    label: "absolute public-file route",
    token: "GENERIC_ABSOLUTE_PUBLIC_FILE_TOKEN",
    url: "https://school.example/api/public-files/GENERIC_ABSOLUTE_PUBLIC_FILE_TOKEN?download=GENERIC_ABSOLUTE_PUBLIC_FILE_TOKEN#preview",
  },
  {
    category: "fetch",
    expectedUrl: "/api/files/:token",
    label: "encoded private-file route",
    token: "GENERIC_ENCODED_PRIVATE_FILE_TOKEN",
    url: "/api%2Ffiles/GENERIC_ENCODED_PRIVATE_FILE_TOKEN?download=GENERIC_ENCODED_PRIVATE_FILE_TOKEN",
  },
  {
    category: "xhr",
    expectedUrl: "/api/public-files/:token",
    label: "malformed public-file route",
    token: "GENERIC_MALFORMED_PUBLIC_FILE_TOKEN",
    url: "/api/public-files/GENERIC_MALFORMED_PUBLIC_FILE_TOKEN%E0%A4%A?download=GENERIC_MALFORMED_PUBLIC_FILE_TOKEN",
  },
  {
    category: "fetch",
    expectedUrl: FILTERED,
    label: "unparseable absolute private-file route",
    token: "GENERIC_UNPARSABLE_PRIVATE_FILE_TOKEN",
    url: "https://[invalid-host/api/files/GENERIC_UNPARSABLE_PRIVATE_FILE_TOKEN%?download=GENERIC_UNPARSABLE_PRIVATE_FILE_TOKEN",
  },
] as const;
const AUTHORITY_LIKE_LOGIN_PATHS = [
  "//portal/login",
  String.raw`/\\portal\\login`,
  String.raw`\\portal\login`,
] as const;
const AUTHORITY_LIKE_SAFE_PATHS = [
  "//portal/teacher/assignments",
  String.raw`/\\portal\\teacher\\assignments`,
  String.raw`\\portal\teacher\assignments`,
] as const;
const SENTRY_ENV_KEYS = [
  "SENTRY_ENABLED",
  "SENTRY_DSN",
  "SENTRY_TRACES_SAMPLE_RATE",
  "NEXT_PUBLIC_SENTRY_DSN",
  "NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE",
] as const;
const SERVER_SENTRY_DSN = "https://server-public-key@o123456.ingest.sentry.io/1";
const CLIENT_SENTRY_DSN = "https://client-public-key@o123456.ingest.sentry.io/2";

type InitOptions = {
  beforeBreadcrumb?: unknown;
  beforeSend?: unknown;
  beforeSendTransaction?: unknown;
  dsn?: string;
  enabled?: boolean;
  sendDefaultPii?: boolean;
  tracesSampleRate?: number;
};

type Runtime = "client" | "edge" | "server";

function setSentryEnv(overrides: Partial<Record<(typeof SENTRY_ENV_KEYS)[number], string>> = {}) {
  const defaults = {
    SENTRY_ENABLED: "false",
    SENTRY_DSN: "",
    SENTRY_TRACES_SAMPLE_RATE: "",
    NEXT_PUBLIC_SENTRY_DSN: "",
    NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE: "",
  };

  for (const key of SENTRY_ENV_KEYS) {
    vi.stubEnv(key, overrides[key] ?? defaults[key]);
  }
}

async function importRuntime(runtime: Runtime) {
  if (runtime === "server") {
    await import("@/sentry.server.config");
    return;
  }

  if (runtime === "edge") {
    await import("@/sentry.edge.config");
    return;
  }

  await import("@/instrumentation-client");
}

async function captureInitOptions(
  runtime: Runtime,
  overrides: Partial<Record<(typeof SENTRY_ENV_KEYS)[number], string>>,
) {
  vi.resetModules();
  sentryInitMock.mockClear();
  setSentryEnv(overrides);
  await importRuntime(runtime);

  expect(sentryInitMock).toHaveBeenCalledTimes(1);
  return sentryInitMock.mock.calls[0]?.[0] as InitOptions;
}

describe("sanitizeSentryEvent", () => {
  it.each(GENERIC_FILE_URL_CASES)(
    "masks a token-bearing $label in a $category breadcrumb URL",
    (fixture) => {
      const event = {
        breadcrumbs: [
          {
            category: fixture.category,
            data: { url: fixture.url },
          },
        ],
      } as Event;
      const snapshot = JSON.parse(JSON.stringify(event)) as Event;

      const sanitized = sanitizeSentryEvent(event);

      expect(event).toEqual(snapshot);
      expect(sanitized.breadcrumbs?.[0]?.data?.url).toBe(fixture.expectedUrl);
      expect(JSON.stringify(sanitized)).not.toContain(fixture.token);
    },
  );

  it.each(GENERIC_FILE_URL_CASES)(
    "masks a token-bearing $label in generic span URL fields",
    (fixture) => {
      const event = {
        spans: [
          {
            data: {
              "http.url": fixture.url,
              url: fixture.url,
              "url.full": fixture.url,
            },
            op: "http.client",
          },
        ],
      } as Event;
      const snapshot = JSON.parse(JSON.stringify(event)) as Event;

      const sanitized = sanitizeSentryEvent(event);
      const spanData = sanitized.spans?.[0]?.data;

      expect(event).toEqual(snapshot);
      expect(spanData?.url).toBe(fixture.expectedUrl);
      expect(spanData?.["http.url"]).toBe(fixture.expectedUrl);
      expect(spanData?.["url.full"]).toBe(fixture.expectedUrl);
      expect(JSON.stringify(sanitized)).not.toContain(fixture.token);
    },
  );

  it("continues stripping queries from generic non-file breadcrumb and span URLs", () => {
    const querySecret = "GENERIC_SAFE_URL_QUERY_SECRET";
    const event = {
      breadcrumbs: [
        {
          category: "fetch",
          data: { url: `https://school.example/api/health?probe=${querySecret}` },
        },
      ],
      spans: [
        {
          data: { url: `/portal/teacher/assignments?view=${querySecret}` },
          op: "http.client",
        },
      ],
    } as Event;

    const sanitized = sanitizeSentryEvent(event);

    expect(sanitized.breadcrumbs?.[0]?.data?.url).toBe("https://school.example/api/health");
    expect(sanitized.spans?.[0]?.data?.url).toBe("/portal/teacher/assignments");
    expect(JSON.stringify(sanitized)).not.toContain(querySecret);
  });

  it("removes nested PII and secrets while preserving technical diagnostics", () => {
    const secrets = {
      authorization: "Bearer AUTH_VALUE_4f967d",
      backupCode: "BACKUP_CODE_765432",
      body: "RAW_BODY_VALUE_91ba",
      cookie: "session=COOKIE_VALUE_62da",
      email: "private.student@example.test",
      guardianName: "Guardian Name 9b8a",
      notes: "Private progress notes 13ef",
      parentName: "Parent Name 28db",
      password: "PASSWORD_VALUE_f804",
      phone: "+254700111999",
      queryToken: "QUERY_TOKEN_40c7",
      recipientName: "Recipient Name d022",
      secret: "CLIENT_SECRET_VALUE_b183",
      session: "SESSION_TOKEN_VALUE_0a4c",
      studentName: "Student Name 6c51",
      userId: "USER_ID_PRIVATE_e26f",
    };
    const event = {
      message: "TypeError while rendering the portal login route",
      release: "release-2026-07-15",
      transaction: "POST /portal/login",
      tags: {
        component: "portal-login",
        releaseChannel: "stable",
      },
      user: {
        id: secrets.userId,
        email: secrets.email,
      },
      exception: {
        values: [
          {
            type: "TypeError",
            value: "Cannot read properties of undefined",
            stacktrace: {
              frames: [
                {
                  filename: "app/portal/login/page.tsx",
                  function: "renderLogin",
                  lineno: 42,
                },
              ],
            },
          },
        ],
      },
      request: {
        url: `https://school.example/portal/login?token=${secrets.queryToken}&returnTo=%2Fportal`,
        method: "POST",
        query_string: `token=${secrets.queryToken}`,
        headers: {
          Accept: "application/json",
          Authorization: secrets.authorization,
          Cookie: secrets.cookie,
          "Set-Cookie": secrets.cookie,
          "User-Agent": "safe-test-agent",
          "X-Api-Key": secrets.secret,
        },
        data: {
          password: secrets.password,
          sessionToken: secrets.session,
        },
        body: {
          raw: secrets.body,
        },
      },
      extra: {
        safeContext: {
          feature: "login",
          retryCount: 2,
        },
        profiles: [
          {
            student_name: secrets.studentName,
            parentFullName: secrets.parentName,
            "guardian-name": secrets.guardianName,
            recipient_name: secrets.recipientName,
            EmailAddress: secrets.email,
            phone_number: secrets.phone,
            private_notes: secrets.notes,
            "backup-codes": [secrets.backupCode],
            credentials: {
              clientSecret: secrets.secret,
              session_id: secrets.session,
            },
          },
        ],
      },
      breadcrumbs: [
        {
          category: "auth.login",
          message: `Login attempt for ${secrets.email}`,
          data: {
            password: secrets.password,
            url: `https://school.example/portal/login?token=${secrets.queryToken}`,
          },
        },
        {
          category: "ui.click",
          message: "Submit clicked",
          data: {
            target: "login-submit",
            refresh_token: secrets.session,
          },
        },
      ],
    } as Event;
    const snapshot = JSON.parse(JSON.stringify(event)) as Event;

    const sanitized = sanitizeSentryEvent(event);
    const serialized = JSON.stringify(sanitized);
    const request = sanitized.request as Event["request"] & { body?: unknown };

    expect(event).toEqual(snapshot);
    expect(sanitized).not.toBe(event);
    expect(sanitized.request).not.toBe(event.request);
    expect(sanitized.extra).not.toBe(event.extra);
    expect(Object.hasOwn(sanitized, "user")).toBe(false);
    expect(sanitized.user).toBeUndefined();

    for (const value of Object.values(secrets)) {
      expect(serialized).not.toContain(value);
    }

    expect(sanitized.message).toBe(event.message);
    expect(sanitized.release).toBe("release-2026-07-15");
    expect(sanitized.transaction).toBe("POST /portal/login");
    expect(sanitized.tags).toEqual({ component: "portal-login", releaseChannel: "stable" });
    expect(sanitized.exception?.values?.[0]?.type).toBe("TypeError");
    expect(sanitized.exception?.values?.[0]?.value).toBe("Cannot read properties of undefined");
    expect(sanitized.exception?.values?.[0]?.stacktrace?.frames?.[0]?.filename).toBe(
      "app/portal/login/page.tsx",
    );
    expect(request?.url).toBe("https://school.example/portal/login");
    expect(request?.query_string).toBeUndefined();
    expect(request?.data).toBeUndefined();
    expect(request?.body).toBeUndefined();
    expect(request?.headers).toEqual({
      Accept: "application/json",
      Authorization: FILTERED,
      Cookie: FILTERED,
      "Set-Cookie": FILTERED,
      "User-Agent": "safe-test-agent",
      "X-Api-Key": FILTERED,
    });
    expect(sanitized.breadcrumbs?.[0]?.message).toBe(FILTERED);
    expect(sanitized.breadcrumbs?.[1]?.message).toBe("Submit clicked");
    expect(sanitized.breadcrumbs?.[1]?.data).toEqual({
      target: "login-submit",
      refresh_token: FILTERED,
    });
  });

  it.each([
    "/enrol?token=QUERY_SECRET",
    "/enrol/confirmation?token=QUERY_SECRET",
    "/contact?token=QUERY_SECRET",
    "/portal/login/verify-2fa?token=QUERY_SECRET",
    "/portal/setup/password?token=QUERY_SECRET",
    "/api/auth/session?token=QUERY_SECRET",
    "https://school.example/api/auth/sso/callback?token=QUERY_SECRET",
  ])("removes request payloads and query data for sensitive route %s", (url) => {
    const event = {
      request: {
        url,
        query_string: "token=QUERY_SECRET",
        data: { safeField: "payload-value" },
        body: { safeField: "body-value" },
      },
    } as Event;

    const sanitized = sanitizeSentryEvent(event);
    const request = sanitized.request as Event["request"] & { body?: unknown };

    expect(request?.url).not.toContain("?");
    expect(request?.query_string).toBeUndefined();
    expect(request?.data).toBeUndefined();
    expect(request?.body).toBeUndefined();
  });

  it.each([
    {
      label: "private signed file route with absolute request and transaction URLs",
      route: "/api/files",
      token: "PRIVATE_SIGNED_FILE_TOKEN_1a7d4e",
      requestUrl: "https://school.example/api/files/PRIVATE_SIGNED_FILE_TOKEN_1a7d4e?download=1",
      transaction:
        "GET https://school.example/api/files/PRIVATE_SIGNED_FILE_TOKEN_1a7d4e?download=1",
      expectedRequestUrl: "https://school.example/api/files/:token",
      expectedTransaction: "GET https://school.example/api/files/:token",
    },
    {
      label: "public signed file route with path request and transaction URLs",
      route: "/api/public-files",
      token: "PUBLIC_SIGNED_FILE_TOKEN_8c2f6b",
      requestUrl: "/api/public-files/PUBLIC_SIGNED_FILE_TOKEN_8c2f6b?download=1",
      transaction: "POST /api/public-files/PUBLIC_SIGNED_FILE_TOKEN_8c2f6b?download=1",
      expectedRequestUrl: "/api/public-files/:token",
      expectedTransaction: "POST /api/public-files/:token",
    },
  ])(
    "redacts the dynamic token for $label without losing its route family or HTTP method",
    (fixture) => {
      const event = {
        transaction: fixture.transaction,
        request: {
          url: fixture.requestUrl,
          method: fixture.transaction.split(" ")[0],
          query_string: "download=1",
          headers: {
            Cookie: `ulu_file=${fixture.token}`,
            "User-Agent": "safe-test-agent",
          },
          data: { safeField: "sensitive-file-route-payload" },
          body: { safeField: "sensitive-file-route-body" },
        },
      } as Event;
      const snapshot = JSON.parse(JSON.stringify(event)) as Event;

      const sanitized = sanitizeSentryEvent(event);
      const request = sanitized.request as Event["request"] & { body?: unknown };
      const serialized = JSON.stringify(sanitized);

      expect(event).toEqual(snapshot);
      expect(sanitized.transaction).toBe(fixture.expectedTransaction);
      expect(request?.url).toBe(fixture.expectedRequestUrl);
      expect(request?.query_string).toBeUndefined();
      expect(request?.headers).toEqual({
        Cookie: FILTERED,
        "User-Agent": "safe-test-agent",
      });
      expect(request?.data).toBeUndefined();
      expect(request?.body).toBeUndefined();
      expect(serialized).not.toContain(fixture.token);
      expect(sanitized.transaction).toContain(fixture.route);
      expect(sanitized.transaction).toMatch(/^(?:GET|POST) /);
    },
  );

  it.each(MALFORMED_FILE_ROUTE_CASES)("never serializes a signed token for $label", (fixture) => {
    const event = {
      transaction: fixture.transaction,
      request: {
        url: fixture.requestUrl,
        method: "GET",
        query_string: `download=${fixture.token}`,
        headers: {
          Authorization: `Bearer ${fixture.token}`,
          Cookie: `ulu_file=${fixture.token}`,
          "User-Agent": "safe-test-agent",
        },
        data: { safeField: `payload-${fixture.token}` },
        body: { safeField: `body-${fixture.token}` },
      },
    } as Event;
    const snapshot = JSON.parse(JSON.stringify(event)) as Event;

    const sanitized = sanitizeSentryEvent(event);
    const request = sanitized.request as Event["request"] & { body?: unknown };
    const serialized = JSON.stringify(sanitized);

    expect(event).toEqual(snapshot);
    expect(sanitized.transaction).toBe(fixture.expectedTransaction);
    expect(request?.url).toBe(fixture.expectedRequestUrl);
    expect(request?.query_string).toBeUndefined();
    expect(request?.headers).toEqual({
      Authorization: FILTERED,
      Cookie: FILTERED,
      "User-Agent": "safe-test-agent",
    });
    expect(request?.data).toBeUndefined();
    expect(request?.body).toBeUndefined();
    expect(serialized).not.toContain(fixture.token);
  });

  it.each(ENCODED_LEADING_FILE_ROUTE_CASES)(
    "filters $label when request URL fallback uses its transaction",
    (fixture) => {
      const event = {
        transaction: fixture.transaction,
        request: {
          headers: { Cookie: `ulu_file=${fixture.token}` },
          data: { safeField: `payload-${fixture.token}` },
          body: { safeField: `body-${fixture.token}` },
        },
      } as Event;

      const sanitized = sanitizeSentryEvent(event);
      const request = sanitized.request as Event["request"] & { body?: unknown };
      const serialized = JSON.stringify(sanitized);

      expect(sanitized.transaction).toBe(fixture.expectedTransaction);
      expect(request?.headers).toEqual({ Cookie: FILTERED });
      expect(request?.data).toBeUndefined();
      expect(request?.body).toBeUndefined();
      expect(serialized).not.toContain(fixture.token);
    },
  );

  it.each(UNPARSABLE_ABSOLUTE_FILE_ROUTE_CASES)("filters $label", (fixture) => {
    const event = {
      transaction: fixture.transaction,
      request: {
        url: fixture.requestUrl,
        headers: { Cookie: `ulu_file=${fixture.token}` },
        data: { safeField: `payload-${fixture.token}` },
        body: { safeField: `body-${fixture.token}` },
      },
    } as Event;

    const sanitized = sanitizeSentryEvent(event);
    const request = sanitized.request as Event["request"] & { body?: unknown };
    const serialized = JSON.stringify(sanitized);

    expect(sanitized.transaction).toBe("PATCH [Filtered]");
    expect(request?.url).toBe(FILTERED);
    expect(request?.headers).toEqual({ Cookie: FILTERED });
    expect(request?.data).toBeUndefined();
    expect(request?.body).toBeUndefined();
    expect(serialized).not.toContain(fixture.token);
  });

  it.each([
    [undefined, "POST /portal/login"],
    ["not a request URL", "post   /portal/login"],
  ])("uses an HTTP-method-prefixed transaction when request URL is %s", (url, transaction) => {
    const event = {
      transaction,
      request: {
        ...(url === undefined ? {} : { url }),
        data: { safeField: "sensitive-route-payload" },
        body: { safeField: "sensitive-route-body" },
      },
    } as Event;

    const sanitized = sanitizeSentryEvent(event);
    const request = sanitized.request as Event["request"] & { body?: unknown };

    expect(request?.data).toBeUndefined();
    expect(request?.body).toBeUndefined();
  });

  it("preserves request payloads for a safe transaction fallback", () => {
    const event = {
      transaction: "POST /portal/teacher/assignments",
      request: {
        data: { safeField: "safe-transaction-payload" },
        body: { safeField: "safe-transaction-body" },
      },
    } as Event;

    const sanitized = sanitizeSentryEvent(event);
    const request = sanitized.request as Event["request"] & { body?: unknown };

    expect(request?.data).toEqual({ safeField: "safe-transaction-payload" });
    expect(request?.body).toEqual({ safeField: "safe-transaction-body" });
  });

  it.each(AUTHORITY_LIKE_LOGIN_PATHS)(
    "treats slash/backslash-leading request route %s as a sensitive path",
    (url) => {
      const event = {
        request: {
          url,
          data: { safeField: "authority-request-payload" },
          body: { safeField: "authority-request-body" },
        },
      } as Event;

      const sanitized = sanitizeSentryEvent(event);
      const request = sanitized.request as Event["request"] & { body?: unknown };

      expect(request?.data).toBeUndefined();
      expect(request?.body).toBeUndefined();
    },
  );

  it.each(AUTHORITY_LIKE_LOGIN_PATHS)(
    "treats transaction route POST %s as a sensitive path fallback",
    (route) => {
      const event = {
        transaction: `POST ${route}`,
        request: {
          data: { safeField: "authority-transaction-payload" },
          body: { safeField: "authority-transaction-body" },
        },
      } as Event;

      const sanitized = sanitizeSentryEvent(event);
      const request = sanitized.request as Event["request"] & { body?: unknown };

      expect(request?.data).toBeUndefined();
      expect(request?.body).toBeUndefined();
    },
  );

  it.each(AUTHORITY_LIKE_SAFE_PATHS)(
    "preserves request payloads for safe slash/backslash-leading path %s",
    (url) => {
      const event = {
        request: {
          url,
          data: { safeField: "safe-authority-request-payload" },
          body: { safeField: "safe-authority-request-body" },
        },
      } as Event;

      const sanitized = sanitizeSentryEvent(event);
      const request = sanitized.request as Event["request"] & { body?: unknown };

      expect(request?.data).toEqual({ safeField: "safe-authority-request-payload" });
      expect(request?.body).toEqual({ safeField: "safe-authority-request-body" });
    },
  );

  it.each(AUTHORITY_LIKE_SAFE_PATHS)(
    "preserves request payloads for safe transaction path POST %s",
    (route) => {
      const event = {
        transaction: `POST ${route}`,
        request: {
          data: { safeField: "safe-authority-transaction-payload" },
          body: { safeField: "safe-authority-transaction-body" },
        },
      } as Event;

      const sanitized = sanitizeSentryEvent(event);
      const request = sanitized.request as Event["request"] & { body?: unknown };

      expect(request?.data).toEqual({ safeField: "safe-authority-transaction-payload" });
      expect(request?.body).toEqual({ safeField: "safe-authority-transaction-body" });
    },
  );

  it("strips a query before classifying a slash-leading request path", () => {
    const event = {
      request: {
        url: "//portal/login?token=QUERY_SECRET",
        data: { safeField: "query-request-payload" },
        body: { safeField: "query-request-body" },
      },
    } as Event;

    const sanitized = sanitizeSentryEvent(event);
    const request = sanitized.request as Event["request"] & { body?: unknown };

    expect(request?.url).toBe("//portal/login");
    expect(request?.data).toBeUndefined();
    expect(request?.body).toBeUndefined();
  });

  it("strips a query before classifying a slash-leading transaction path", () => {
    const event = {
      transaction: "POST //portal/login?token=QUERY_SECRET",
      request: {
        data: { safeField: "query-transaction-payload" },
        body: { safeField: "query-transaction-body" },
      },
    } as Event;
    const snapshot = JSON.parse(JSON.stringify(event)) as Event;

    const sanitized = sanitizeSentryEvent(event);
    const request = sanitized.request as Event["request"] & { body?: unknown };

    expect(event).toEqual(snapshot);
    expect(sanitized.transaction).toBe("POST //portal/login");
    expect(JSON.stringify(sanitized)).not.toContain("QUERY_SECRET");
    expect(request?.data).toBeUndefined();
    expect(request?.body).toBeUndefined();
  });

  it("preserves a safe slash-leading transaction path with a query", () => {
    const event = {
      transaction: "POST //portal/teacher/assignments?token=SAFE_ROUTE_QUERY_SECRET",
      request: {
        data: { safeField: "safe-query-transaction-payload" },
        body: { safeField: "safe-query-transaction-body" },
      },
    } as Event;
    const snapshot = JSON.parse(JSON.stringify(event)) as Event;

    const sanitized = sanitizeSentryEvent(event);
    const request = sanitized.request as Event["request"] & { body?: unknown };

    expect(event).toEqual(snapshot);
    expect(sanitized.transaction).toBe("POST //portal/teacher/assignments");
    expect(JSON.stringify(sanitized)).not.toContain("SAFE_ROUTE_QUERY_SECRET");
    expect(request?.data).toEqual({ safeField: "safe-query-transaction-payload" });
    expect(request?.body).toEqual({ safeField: "safe-query-transaction-body" });
  });

  it("strips a query from an absolute HTTP transaction", () => {
    const event = {
      transaction: "GET https://school.example/portal/login?token=ABSOLUTE_TRANSACTION_SECRET",
      request: {
        data: { safeField: "absolute-transaction-payload" },
        body: { safeField: "absolute-transaction-body" },
      },
    } as Event;
    const snapshot = JSON.parse(JSON.stringify(event)) as Event;

    const sanitized = sanitizeSentryEvent(event);
    const request = sanitized.request as Event["request"] & { body?: unknown };

    expect(event).toEqual(snapshot);
    expect(sanitized.transaction).toBe("GET https://school.example/portal/login");
    expect(JSON.stringify(sanitized)).not.toContain("ABSOLUTE_TRANSACTION_SECRET");
    expect(request?.data).toBeUndefined();
    expect(request?.body).toBeUndefined();
  });

  it("strips a fragment from a safe route transaction", () => {
    const event = {
      transaction: "PATCH /portal/teacher/assignments#FRAGMENT_TRANSACTION_SECRET",
      request: {
        data: { safeField: "fragment-transaction-payload" },
        body: { safeField: "fragment-transaction-body" },
      },
    } as Event;
    const snapshot = JSON.parse(JSON.stringify(event)) as Event;

    const sanitized = sanitizeSentryEvent(event);
    const request = sanitized.request as Event["request"] & { body?: unknown };

    expect(event).toEqual(snapshot);
    expect(sanitized.transaction).toBe("PATCH /portal/teacher/assignments");
    expect(JSON.stringify(sanitized)).not.toContain("FRAGMENT_TRANSACTION_SECRET");
    expect(request?.data).toEqual({ safeField: "fragment-transaction-payload" });
    expect(request?.body).toEqual({ safeField: "fragment-transaction-body" });
  });

  it("strips a route transaction query without a request object", () => {
    const event = {
      message: "Portal login transaction failed",
      transaction: "POST /portal/login?token=NO_REQUEST_TRANSACTION_SECRET",
    } as Event;
    const snapshot = JSON.parse(JSON.stringify(event)) as Event;

    const sanitized = sanitizeSentryEvent(event);

    expect(event).toEqual(snapshot);
    expect(sanitized.transaction).toBe("POST /portal/login");
    expect(JSON.stringify(sanitized)).not.toContain("NO_REQUEST_TRANSACTION_SECRET");
    expect(sanitized.message).toBe(event.message);
  });

  it.each(["checkout.process?phase=validation#retry", "POST background.job?phase=retry#worker"])(
    "preserves non-route technical transaction label %s",
    (transaction) => {
      const event = {
        transaction,
        request: {
          data: { safeField: "technical-label-payload" },
          body: { safeField: "technical-label-body" },
        },
      } as Event;
      const snapshot = JSON.parse(JSON.stringify(event)) as Event;

      const sanitized = sanitizeSentryEvent(event);
      const request = sanitized.request as Event["request"] & { body?: unknown };

      expect(event).toEqual(snapshot);
      expect(sanitized.transaction).toBe(transaction);
      expect(request?.data).toEqual({ safeField: "technical-label-payload" });
      expect(request?.body).toEqual({ safeField: "technical-label-body" });
    },
  );

  it("continues to URL-parse a true absolute HTTP URL", () => {
    const event = {
      request: {
        url: "https://portal/login?view=active",
        data: { safeField: "absolute-url-payload" },
        body: { safeField: "absolute-url-body" },
      },
    } as Event;

    const sanitized = sanitizeSentryEvent(event);
    const request = sanitized.request as Event["request"] & { body?: unknown };

    expect(request?.url).toBe("https://portal/login");
    expect(request?.data).toEqual({ safeField: "absolute-url-payload" });
    expect(request?.body).toEqual({ safeField: "absolute-url-body" });
  });

  it.each(["/portal%252Flogin", "/portal%2Flogin/%E0%A4%A"])(
    "fails closed for encoded sensitive route %s",
    (url) => {
      const event = {
        request: {
          url,
          data: { safeField: "encoded-route-payload" },
          body: { safeField: "encoded-route-body" },
        },
      } as Event;

      const sanitized = sanitizeSentryEvent(event);
      const request = sanitized.request as Event["request"] & { body?: unknown };

      expect(request?.data).toBeUndefined();
      expect(request?.body).toBeUndefined();
    },
  );

  it.each([
    "/%252e%252e/portal/login",
    "/%252Fportal/login",
    "/%252e/portal/login",
    "/%255Cportal/login",
  ])("removes request payloads after canonicalizing encoded route %s", (url) => {
    const event = {
      request: {
        url,
        data: { safeField: "canonical-route-payload" },
        body: { safeField: "canonical-route-body" },
      },
    } as Event;

    const sanitized = sanitizeSentryEvent(event);
    const request = sanitized.request as Event["request"] & { body?: unknown };

    expect(request?.data).toBeUndefined();
    expect(request?.body).toBeUndefined();
  });

  it.each([
    "/portal/login/%252e%252e/teacher",
    "/%252Fportal/teacher/assignments",
    "/%255Cportal/teacher/assignments",
  ])("preserves request payloads when canonical route %s is safe", (url) => {
    const event = {
      request: {
        url,
        data: { safeField: "safe-canonical-payload" },
        body: { safeField: "safe-canonical-body" },
      },
    } as Event;

    const sanitized = sanitizeSentryEvent(event);
    const request = sanitized.request as Event["request"] & { body?: unknown };

    expect(request?.data).toEqual({ safeField: "safe-canonical-payload" });
    expect(request?.body).toEqual({ safeField: "safe-canonical-body" });
  });

  it.each(["/contact-us", "/portal/logins", "/api/authentication", "/api/filesafe/auth"])(
    "preserves safe request payloads outside sensitive route boundaries for %s",
    (url) => {
      const event = {
        request: {
          url,
          data: { safeField: "payload-value" },
          body: { safeField: "body-value" },
        },
      } as Event;

      const sanitized = sanitizeSentryEvent(event);
      const request = sanitized.request as Event["request"] & { body?: unknown };

      expect(request?.data).toEqual({ safeField: "payload-value" });
      expect(request?.body).toEqual({ safeField: "body-value" });
    },
  );

  it("fails closed for circular and excessively deep nested data without mutating input", () => {
    const circular: Record<string, unknown> = {
      password: "CIRCULAR_PASSWORD_SECRET",
      safe: "kept",
    };
    circular.self = circular;

    const deep: Record<string, unknown> = {};
    let cursor = deep;
    for (let index = 0; index < 100; index += 1) {
      const next: Record<string, unknown> = {};
      cursor.next = next;
      cursor = next;
    }
    cursor.password = "DEEP_PASSWORD_SECRET";

    const event = { extra: { circular, deep } } as Event;
    const sanitized = sanitizeSentryEvent(event);
    const serialized = JSON.stringify(sanitized);
    const sanitizedCircular = (sanitized.extra?.circular ?? {}) as Record<string, unknown>;

    expect(serialized).not.toContain("CIRCULAR_PASSWORD_SECRET");
    expect(serialized).not.toContain("DEEP_PASSWORD_SECRET");
    expect(sanitizedCircular.self).toBe(FILTERED);
    expect(circular.self).toBe(circular);
    expect(cursor.password).toBe("DEEP_PASSWORD_SECRET");
  });
});

describe("sanitizeSentryBreadcrumb", () => {
  it.each(["auth.login", "enrol.submit", "contact-form", "setup.2fa"])(
    "filters messages and nested data for %s breadcrumbs",
    (category) => {
      const breadcrumb = {
        category,
        message: "PRIVATE_BREADCRUMB_MESSAGE",
        data: {
          nested: [{ access_token: "BREADCRUMB_TOKEN_SECRET" }],
          url: "/portal/setup/2fa?token=BREADCRUMB_QUERY_SECRET",
          safeField: "safe-value",
        },
      };

      const sanitized = sanitizeSentryBreadcrumb(breadcrumb);

      expect(breadcrumb.message).toBe("PRIVATE_BREADCRUMB_MESSAGE");
      expect(breadcrumb.data.nested[0]?.access_token).toBe("BREADCRUMB_TOKEN_SECRET");
      expect(sanitized).not.toBe(breadcrumb);
      expect(sanitized.message).toBe(FILTERED);
      expect(JSON.stringify(sanitized)).not.toContain("BREADCRUMB_TOKEN_SECRET");
      expect(JSON.stringify(sanitized)).not.toContain("BREADCRUMB_QUERY_SECRET");
      expect(sanitized.data?.safeField).toBe("safe-value");
    },
  );

  it("does not classify an unrelated category containing auth-like letters as sensitive", () => {
    const sanitized = sanitizeSentryBreadcrumb({
      category: "authoring",
      message: "Technical editor state",
      data: { target: "editor" },
    });

    expect(sanitized.message).toBe("Technical editor state");
  });
});

describe("parseSentrySampleRate", () => {
  it.each([
    [undefined, 0.05],
    ["", 0.05],
    ["not-a-number", 0.05],
    ["-0.1", 0.05],
    ["2", 0.05],
    ["Infinity", 0.05],
    ["0", 0],
    ["0.2", 0.2],
    [" 0.5 ", 0.5],
    ["1", 1],
  ])("maps %s to %s", (input, expected) => {
    expect(parseSentrySampleRate(input)).toBe(expected);
  });
});

describe("Sentry runtime configuration", () => {
  beforeEach(() => {
    vi.resetModules();
    sentryInitMock.mockClear();
    setSentryEnv();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("uses identical privacy hooks and sample-rate parsing in server, edge, and client", async () => {
    setSentryEnv({
      SENTRY_ENABLED: "true",
      SENTRY_DSN: SERVER_SENTRY_DSN,
      SENTRY_TRACES_SAMPLE_RATE: "0.2",
      NEXT_PUBLIC_SENTRY_DSN: CLIENT_SENTRY_DSN,
      NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE: "0.2",
    });
    const sanitizer = await import("@/lib/monitoring/sentry-sanitize");

    await importRuntime("server");
    await importRuntime("edge");
    await importRuntime("client");

    expect(sentryInitMock).toHaveBeenCalledTimes(3);
    for (const [options] of sentryInitMock.mock.calls as [
      [InitOptions],
      [InitOptions],
      [InitOptions],
    ]) {
      expect(options.beforeSend).toBe(sanitizer.sanitizeSentryEvent);
      expect(options.beforeSendTransaction).toBe(sanitizer.sanitizeSentryEvent);
      expect(options.beforeBreadcrumb).toBe(sanitizer.sanitizeSentryBreadcrumb);
      expect(options.sendDefaultPii).toBe(false);
      expect(options.tracesSampleRate).toBe(0.2);
    }
  });

  it.each(["server", "edge", "client"] as const)(
    "sanitizes %s transaction names and standard span URL attributes through the runtime hook",
    async (runtime) => {
      const options = await captureInitOptions(runtime, {
        SENTRY_ENABLED: "true",
        SENTRY_DSN: SERVER_SENTRY_DSN,
        NEXT_PUBLIC_SENTRY_DSN: CLIENT_SENTRY_DSN,
      });
      const sanitizer = await import("@/lib/monitoring/sentry-sanitize");
      const beforeSendTransaction = options.beforeSendTransaction as
        | typeof sanitizer.sanitizeSentryEvent
        | undefined;
      const token = `RUNTIME_${runtime.toUpperCase()}_TRANSACTION_FILE_TOKEN`;
      const privateUrl = `/api/files/${token}?download=${token}`;
      const event = {
        transaction: `GET ${privateUrl}`,
        spans: [
          {
            data: {
              url: privateUrl,
              "http.url": privateUrl,
              "url.full": privateUrl,
            },
            op: "http.client",
          },
        ],
      } as Event;

      expect(beforeSendTransaction).toBe(sanitizer.sanitizeSentryEvent);
      const sanitized = beforeSendTransaction?.(event);

      expect(sanitized?.transaction).toBe("GET /api/files/:token");
      expect(sanitized?.spans?.[0]?.data).toMatchObject({
        url: "/api/files/:token",
        "http.url": "/api/files/:token",
        "url.full": "/api/files/:token",
      });
      expect(JSON.stringify(sanitized)).not.toContain(token);
    },
  );

  it.each(["server", "edge"] as const)(
    "enables %s only with the exact flag and a non-empty private DSN",
    async (runtime) => {
      const enabled = await captureInitOptions(runtime, {
        SENTRY_ENABLED: "true",
        SENTRY_DSN: `  ${SERVER_SENTRY_DSN}  `,
      });
      const disabledByFlag = await captureInitOptions(runtime, {
        SENTRY_ENABLED: "false",
        SENTRY_DSN: SERVER_SENTRY_DSN,
      });
      const disabledByDsn = await captureInitOptions(runtime, {
        SENTRY_ENABLED: "true",
        SENTRY_DSN: "   ",
        NEXT_PUBLIC_SENTRY_DSN: CLIENT_SENTRY_DSN,
      });

      expect(enabled.dsn).toBe(SERVER_SENTRY_DSN);
      expect(enabled.enabled).toBe(true);
      expect(disabledByFlag.enabled).toBe(false);
      expect(disabledByDsn.enabled).toBe(false);
      expect(disabledByDsn.dsn).toBe("");
    },
  );

  it("enables the client only with a non-empty public DSN", async () => {
    const enabled = await captureInitOptions("client", {
      SENTRY_ENABLED: "false",
      NEXT_PUBLIC_SENTRY_DSN: `  ${CLIENT_SENTRY_DSN}  `,
    });
    const disabled = await captureInitOptions("client", {
      SENTRY_ENABLED: "true",
      NEXT_PUBLIC_SENTRY_DSN: "   ",
    });

    expect(enabled.dsn).toBe(CLIENT_SENTRY_DSN);
    expect(enabled.enabled).toBe(true);
    expect(disabled.dsn).toBe("");
    expect(disabled.enabled).toBe(false);
  });

  it("statically wires all three init points without logging monitoring configuration", () => {
    const sourcePaths = [
      "sentry.server.config.ts",
      "sentry.edge.config.ts",
      "instrumentation-client.ts",
    ];

    for (const sourcePath of sourcePaths) {
      const source = readFileSync(join(process.cwd(), sourcePath), "utf8");

      expect(source).toMatch(/beforeSend\s*:\s*sanitizeSentryEvent/);
      expect(source).toMatch(/beforeSendTransaction\s*:\s*sanitizeSentryEvent/);
      expect(source).toMatch(/beforeBreadcrumb\s*:\s*sanitizeSentryBreadcrumb/);
      expect(source).toMatch(/sendDefaultPii\s*:\s*false/);
      expect(source).toMatch(/parseSentrySampleRate\s*\(/);
      expect(source).not.toMatch(/console\./);
    }

    const serverSource = readFileSync(join(process.cwd(), "sentry.server.config.ts"), "utf8");
    const edgeSource = readFileSync(join(process.cwd(), "sentry.edge.config.ts"), "utf8");
    expect(serverSource).not.toContain("NEXT_PUBLIC_SENTRY_DSN");
    expect(edgeSource).not.toContain("NEXT_PUBLIC_SENTRY_DSN");
  });

  it("keeps the shared sanitizer free of Node-only or logging APIs", () => {
    const source = readFileSync(join(process.cwd(), "lib/monitoring/sentry-sanitize.ts"), "utf8");

    expect(source).not.toMatch(/from\s+["']node:|\bBuffer\b|process\.|console\./);
  });
});
