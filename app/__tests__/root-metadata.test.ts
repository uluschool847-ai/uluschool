import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

const themeProviderMock = vi.hoisted(() => vi.fn(() => null));

vi.mock("next/font/google", () => ({
  Inter: () => ({ variable: "--font-body" }),
  Playfair_Display: () => ({ variable: "--font-heading" }),
}));
vi.mock("@/components/layout/site-footer", () => ({ SiteFooter: () => null }));
vi.mock("@/components/layout/site-header", () => ({ SiteHeader: () => null }));
vi.mock("@/components/providers/theme-provider", () => ({ ThemeProvider: themeProviderMock }));

const originalAppEnv = process.env.APP_ENV;

function setAppEnv(value: string | undefined) {
  if (value === undefined) {
    Reflect.deleteProperty(process.env, "APP_ENV");
    return;
  }

  process.env.APP_ENV = value;
}

afterEach(() => {
  vi.clearAllMocks();
  setAppEnv(originalAppEnv);
  vi.resetModules();
});

describe("root theme defaults", () => {
  it("starts new visitors in light mode while leaving explicit theme selection enabled", async () => {
    const { default: RootLayout } = await import("@/app/layout");

    renderToStaticMarkup(RootLayout({ children: null }));

    expect(themeProviderMock.mock.calls[0]?.[0]).toEqual(
      expect.objectContaining({
        attribute: "class",
        defaultTheme: "light",
        enableSystem: false,
        disableTransitionOnChange: true,
      }),
    );
  });
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
