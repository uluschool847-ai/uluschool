import { afterEach, describe, expect, it, vi } from "vitest";

const originalAppEnv = process.env.APP_ENV;

function setAppEnv(value: string | undefined) {
  if (value === undefined) {
    Reflect.deleteProperty(process.env, "APP_ENV");
    return;
  }

  process.env.APP_ENV = value;
}

afterEach(() => {
  setAppEnv(originalAppEnv);
  vi.resetModules();
});

describe("robots crawler policy", () => {
  it.each([
    ["staging", false],
    [undefined, false],
    ["production", true],
  ] as const)("uses a production-only allow policy for APP_ENV=%s", async (appEnv, indexable) => {
    setAppEnv(appEnv);
    vi.resetModules();
    const [{ default: robots }, { siteConfig }] = await Promise.all([
      import("@/app/robots"),
      import("@/lib/content"),
    ]);

    const policy = robots();

    if (indexable) {
      expect(policy.rules).toEqual({ userAgent: "*", allow: "/" });
      expect(policy.sitemap).toBe(`${siteConfig.url}/sitemap.xml`);
      return;
    }

    expect(policy.rules).toEqual({ userAgent: "*", disallow: "/" });
    expect(policy).not.toHaveProperty("sitemap");
  });
});
