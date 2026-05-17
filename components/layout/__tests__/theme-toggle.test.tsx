import { cleanup, render } from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

const setThemeMock = vi.hoisted(() => vi.fn());
const useThemeMock = vi.hoisted(() => vi.fn());

vi.mock("next-themes", () => ({
  useTheme: useThemeMock,
}));

import { ThemeToggle } from "@/components/layout/theme-toggle";

describe("ThemeToggle misleading UI safeguards", () => {
  afterEach(() => {
    cleanup();
  });

  it("does not render a disabled theme control in the initial theme toggle markup", () => {
    useThemeMock.mockReturnValue({ resolvedTheme: "light", setTheme: setThemeMock });

    const html = renderToStaticMarkup(<ThemeToggle />);

    expect(html).not.toMatch(/aria-label="Toggle theme"[^>]*disabled/i);
    expect(html).not.toMatch(/aria-disabled="true"/i);
  });

  it("does not expose disabled theme buttons or switches after render", () => {
    useThemeMock.mockReturnValue({ resolvedTheme: "dark", setTheme: setThemeMock });
    const { container } = render(<ThemeToggle />);

    const disabledControls = Array.from(
      container.querySelectorAll(
        "button[disabled], [role='button'][aria-disabled='true'], [role='switch'][aria-disabled='true']",
      ),
    );

    expect(disabledControls).toHaveLength(0);
  });

  it("either renders a functional theme control or renders nothing", () => {
    useThemeMock.mockReturnValue({ resolvedTheme: "light", setTheme: setThemeMock });
    const { container } = render(<ThemeToggle />);

    const toggles = Array.from(
      container.querySelectorAll("button, [role='button'], [role='switch']"),
    );

    if (toggles.length > 0) {
      expect(
        toggles.some(
          (toggle) =>
            toggle.hasAttribute("disabled") || toggle.getAttribute("aria-disabled") === "true",
        ),
      ).toBe(false);
    } else {
      expect(toggles).toHaveLength(0);
    }
  });
});
