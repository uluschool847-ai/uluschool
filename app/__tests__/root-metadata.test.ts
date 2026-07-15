import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next/font/google", () => ({
  Inter: () => ({ variable: "--font-body" }),
  Playfair_Display: () => ({ variable: "--font-heading" }),
}));
vi.mock("@/components/layout/site-footer", () => ({ SiteFooter: () => null }));
vi.mock("@/components/layout/site-header", () => ({ SiteHeader: () => null }));
vi.mock("@/components/providers/theme-provider", () => ({ ThemeProvider: () => null }));

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

describe("root metadata crawler policy", () => {
  it.each([
    ["staging", false],
    [undefined, false],
    ["production", true],
  ] as const)("sets index and follow from exact APP_ENV=%s", async (appEnv, indexable) => {
    setAppEnv(appEnv);
    vi.resetModules();

    const { metadata } = await import("@/app/layout");

    expect(metadata.robots).toEqual({
      index: indexable,
      follow: indexable,
    });
  });
});
