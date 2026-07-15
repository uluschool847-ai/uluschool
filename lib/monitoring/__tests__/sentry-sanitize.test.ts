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
const SENTRY_ENV_KEYS = [
  "SENTRY_ENABLED",
  "SENTRY_DSN",
  "SENTRY_TRACES_SAMPLE_RATE",
  "NEXT_PUBLIC_SENTRY_DSN",
  "NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE",
] as const;

type InitOptions = {
  beforeBreadcrumb?: unknown;
  beforeSend?: unknown;
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

  it.each(["/contact-us", "/portal/logins", "/api/authentication", "/api/files/auth"])(
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
      SENTRY_DSN: "https://server-public-key@sentry.invalid/1",
      SENTRY_TRACES_SAMPLE_RATE: "0.2",
      NEXT_PUBLIC_SENTRY_DSN: "https://client-public-key@sentry.invalid/2",
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
      expect(options.beforeBreadcrumb).toBe(sanitizer.sanitizeSentryBreadcrumb);
      expect(options.sendDefaultPii).toBe(false);
      expect(options.tracesSampleRate).toBe(0.2);
    }
  });

  it.each(["server", "edge"] as const)(
    "enables %s only with the exact flag and a non-empty private DSN",
    async (runtime) => {
      const enabled = await captureInitOptions(runtime, {
        SENTRY_ENABLED: "true",
        SENTRY_DSN: "  https://server-public-key@sentry.invalid/1  ",
      });
      const disabledByFlag = await captureInitOptions(runtime, {
        SENTRY_ENABLED: "false",
        SENTRY_DSN: "https://server-public-key@sentry.invalid/1",
      });
      const disabledByDsn = await captureInitOptions(runtime, {
        SENTRY_ENABLED: "true",
        SENTRY_DSN: "   ",
        NEXT_PUBLIC_SENTRY_DSN: "https://client-public-key@sentry.invalid/2",
      });

      expect(enabled.dsn).toBe("https://server-public-key@sentry.invalid/1");
      expect(enabled.enabled).toBe(true);
      expect(disabledByFlag.enabled).toBe(false);
      expect(disabledByDsn.enabled).toBe(false);
      expect(disabledByDsn.dsn).toBe("");
    },
  );

  it("enables the client only with a non-empty public DSN", async () => {
    const enabled = await captureInitOptions("client", {
      SENTRY_ENABLED: "false",
      NEXT_PUBLIC_SENTRY_DSN: "  https://client-public-key@sentry.invalid/2  ",
    });
    const disabled = await captureInitOptions("client", {
      SENTRY_ENABLED: "true",
      NEXT_PUBLIC_SENTRY_DSN: "   ",
    });

    expect(enabled.dsn).toBe("https://client-public-key@sentry.invalid/2");
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
