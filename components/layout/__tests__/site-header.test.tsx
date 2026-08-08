import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const usePathnameMock = vi.hoisted(() => vi.fn());
const fetchMock = vi.hoisted(() => vi.fn());

vi.mock("next/navigation", () => ({
  usePathname: usePathnameMock,
}));

vi.mock("next/link", () => ({
  default: ({ href, children, ...props }: Record<string, unknown>) => (
    <a href={String(href)} {...props}>
      {children}
    </a>
  ),
}));

vi.mock("next/image", () => ({
  default: ({ alt = "mock image", ...props }: Record<string, unknown>) => (
    <div role="img" aria-label={String(alt)} {...props} />
  ),
}));

vi.mock("@/components/layout/theme-toggle", () => ({
  ThemeToggle: () => <button type="button">Theme</button>,
}));

vi.mock("@/app/student-portal/actions", () => ({
  logoutPortal: "/portal/logout",
}));

import { SiteHeader } from "@/components/layout/site-header";

type SessionPayload =
  | { authenticated: false }
  | {
      authenticated: true;
      user: {
        uid: string;
        email: string;
        fullName: string | null;
        role: string;
      };
    };

function setViewport(width: number) {
  Object.defineProperty(window, "innerWidth", {
    configurable: true,
    writable: true,
    value: width,
  });

  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: query.includes("1024") ? width >= 1024 : width < 1024,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
}

function mockSession(payload: SessionPayload) {
  fetchMock.mockResolvedValue({
    ok: true,
    json: async () => payload,
  });
}

async function openMobileMenu() {
  const toggles = await screen.findAllByRole("button", { name: /open menu/i });
  const toggle = toggles[0];
  fireEvent.click(toggle);
  return toggle;
}

describe("SiteHeader responsive and accessibility behavior", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    usePathnameMock.mockReturnValue("/");
    global.fetch = fetchMock as typeof fetch;
    mockSession({ authenticated: false });
    setViewport(1280);
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("renders desktop navigation links for desktop breakpoints", async () => {
    setViewport(1280);
    render(<SiteHeader />);

    const navigation = await screen.findByRole("navigation", { name: /main navigation/i });
    expect(navigation).not.toBeNull();
    expect(navigation.className).toContain("lg:flex");
    expect(navigation.className).not.toContain("2xl:flex");
    expect(within(navigation).getAllByRole("link").length).toBeGreaterThan(0);
  });

  it("keeps the narrow header compact and exposes navigation until authenticated desktop links appear", async () => {
    mockSession({
      authenticated: true,
      user: {
        uid: "admin-1",
        email: "admin@example.com",
        fullName: "Admin One",
        role: "ADMIN",
      },
    });

    render(<SiteHeader />);

    const logo = screen.getByRole("link", { name: /ulu online school home/i });
    expect(logo.className).toContain("shrink-0");
    const wordmark = within(logo).getByText("ULU Online School");
    expect(wordmark.className).toContain("hidden");
    expect(wordmark.className).toContain("sm:inline");
    expect(wordmark.className).toContain("whitespace-nowrap");

    const desktopIdentity = (await screen.findByText("Admin One")).parentElement?.parentElement;
    expect(desktopIdentity?.className).toContain("hidden");
    expect(desktopIdentity?.className).toContain("xl:flex");

    const navigation = await screen.findByRole("navigation", { name: /main navigation/i });
    expect(navigation.className).toContain("2xl:flex");
    expect(navigation.className).not.toContain("lg:flex");

    const menuToggle = screen.getByRole("button", { name: /open menu/i });
    expect(menuToggle.parentElement?.className).toContain("2xl:hidden");
    expect(menuToggle.parentElement?.className).not.toContain("md:hidden");

    fireEvent.click(menuToggle);
    const menuDialog = screen.getByRole("dialog", { name: /mobile navigation menu/i });
    expect(menuDialog.parentElement?.className).toContain("2xl:hidden");
    expect(menuDialog.parentElement?.className).not.toContain("md:hidden");
  });

  it("uses one theme control while keeping authenticated actions beside compact navigation", async () => {
    mockSession({
      authenticated: true,
      user: {
        uid: "admin-1",
        email: "admin@example.com",
        fullName: "Admin One",
        role: "ADMIN",
      },
    });

    render(<SiteHeader />);

    expect(await screen.findAllByRole("button", { name: "Theme" })).toHaveLength(1);
    const portalLink = screen.getByRole("link", { name: "Admin Dashboard" });
    expect(portalLink.parentElement?.className).toContain("hidden");
    expect(portalLink.parentElement?.className).toContain("md:flex");

    const menuToggle = screen.getByRole("button", { name: /open menu/i });
    expect(menuToggle.parentElement?.className).toContain("2xl:hidden");
  });

  it("uses one theme control while keeping guest actions available from md", async () => {
    render(<SiteHeader />);

    expect(await screen.findAllByRole("button", { name: "Theme" })).toHaveLength(1);
    const loginLink = screen.getByRole("link", { name: "Log In" });
    expect(loginLink.parentElement?.className).toContain("hidden");
    expect(loginLink.parentElement?.className).toContain("md:flex");

    const menuToggle = screen.getByRole("button", { name: /open menu/i });
    expect(menuToggle.parentElement?.className).toContain("lg:hidden");
  });

  it("renders a mobile menu toggle for small screens", async () => {
    setViewport(375);
    render(<SiteHeader />);

    expect((await screen.findAllByRole("button", { name: /open menu/i })).length).toBeGreaterThan(
      0,
    );
  });

  it("toggles the mobile menu open and closed from the hamburger button", async () => {
    setViewport(375);
    render(<SiteHeader />);

    const toggle = await openMobileMenu();
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByRole("navigation", { name: /mobile navigation/i })).not.toBeNull();

    fireEvent.click(screen.getByRole("button", { name: /close menu/i }));
    await waitFor(() => {
      expect(screen.queryByRole("navigation", { name: /mobile navigation/i })).toBeNull();
    });
  });

  it("closes the mobile menu when a navigation link is clicked", async () => {
    setViewport(375);
    render(<SiteHeader />);

    const toggle = await openMobileMenu();
    const mobileNav = screen.getByRole("navigation", { name: /mobile navigation/i });
    const firstLink = within(mobileNav).getAllByRole("link")[0];

    fireEvent.click(firstLink);

    await waitFor(() => {
      expect(screen.queryByRole("navigation", { name: /mobile navigation/i })).toBeNull();
      expect(document.activeElement).toBe(toggle);
    });
  });

  it("closes the mobile menu on Escape key", async () => {
    setViewport(375);
    render(<SiteHeader />);

    const toggle = await openMobileMenu();
    fireEvent.keyDown(window, { key: "Escape" });

    await waitFor(() => {
      expect(screen.queryByRole("navigation", { name: /mobile navigation/i })).toBeNull();
      expect(document.activeElement).toBe(toggle);
    });
  });

  it("closes the mobile menu on outside click", async () => {
    setViewport(375);
    render(<SiteHeader />);

    const toggle = await openMobileMenu();
    fireEvent.click(screen.getByRole("button", { name: /close mobile menu/i }));

    await waitFor(() => {
      expect(screen.queryByRole("navigation", { name: /mobile navigation/i })).toBeNull();
      expect(document.activeElement).toBe(toggle);
    });
  });

  it("does not change header height when the mobile menu opens", async () => {
    setViewport(375);
    const { container } = render(<SiteHeader />);

    const header = container.querySelector("header");
    expect(header).not.toBeNull();
    const before = header?.className;

    await openMobileMenu();

    expect(header?.className).toBe(before);
  });

  it("closes the mobile menu when resizing from mobile to desktop", async () => {
    setViewport(375);
    render(<SiteHeader />);

    await openMobileMenu();
    setViewport(1280);
    fireEvent(window, new Event("resize"));

    await waitFor(() => {
      expect(screen.queryByRole("navigation", { name: /mobile navigation/i })).toBeNull();
    });
  });

  it("keeps authenticated navigation open below 2xl and closes it at 2xl", async () => {
    mockSession({
      authenticated: true,
      user: {
        uid: "admin-1",
        email: "admin@example.com",
        fullName: "Admin One",
        role: "ADMIN",
      },
    });
    setViewport(1280);
    render(<SiteHeader />);

    await screen.findByText("Admin One");
    const menuToggle = await openMobileMenu();
    fireEvent(window, new Event("resize"));
    expect(menuToggle.getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByRole("navigation", { name: /mobile navigation/i })).not.toBeNull();

    setViewport(1536);
    fireEvent(window, new Event("resize"));

    await waitFor(() => {
      expect(screen.queryByRole("navigation", { name: /mobile navigation/i })).toBeNull();
    });
  });

  it("gives the hamburger button an accessible name and expanded state", async () => {
    setViewport(375);
    render(<SiteHeader />);

    const toggle = (await screen.findAllByRole("button", { name: /open menu/i }))[0];
    expect(toggle.getAttribute("aria-expanded")).toBe("false");

    fireEvent.click(toggle);
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
  });

  it("renders navigation landmarks with accessible labels", async () => {
    setViewport(375);
    render(<SiteHeader />);

    expect(await screen.findByRole("navigation", { name: /main navigation/i })).not.toBeNull();
    await openMobileMenu();
    expect(screen.getByRole("navigation", { name: /mobile navigation/i })).not.toBeNull();
  });

  it("keeps focus trapped inside the mobile menu while open", async () => {
    setViewport(375);
    render(
      <>
        <button type="button">Outside Action</button>
        <SiteHeader />
      </>,
    );

    await openMobileMenu();
    const mobileNav = screen.getByRole("navigation", { name: /mobile navigation/i });
    const focusables = within(mobileNav).getAllByRole("link");

    focusables[0]?.focus();
    expect(document.activeElement).toBe(focusables[0]);

    fireEvent.keyDown(document.activeElement ?? window, { key: "Tab" });
    expect(mobileNav.contains(document.activeElement)).toBe(true);

    fireEvent.keyDown(document.activeElement ?? window, { key: "Tab", shiftKey: true });
    expect(mobileNav.contains(document.activeElement)).toBe(true);
  });

  it("returns focus to the hamburger when the mobile menu closes", async () => {
    setViewport(375);
    render(<SiteHeader />);

    const toggle = await openMobileMenu();
    fireEvent.keyDown(window, { key: "Escape" });

    await waitFor(() => {
      expect(document.activeElement).toBe(toggle);
    });
  });

  it("provides a skip-to-content link as the first focusable element", () => {
    render(<SiteHeader />);

    const skipLink = screen.getByRole("link", { name: /skip to main content/i });
    expect(skipLink.getAttribute("href")).toBe("#main-content");
  });

  it("does not use positive tabindex values in the header", () => {
    const { container } = render(<SiteHeader />);
    const positiveTabIndex = Array.from(container.querySelectorAll("[tabindex]"))
      .map((element) => Number(element.getAttribute("tabindex")))
      .filter((value) => value > 0);

    expect(positiveTabIndex).toHaveLength(0);
  });

  it("renders the header as a top-level landmark", () => {
    const { container } = render(<SiteHeader />);

    expect(container.querySelector("header, [role='banner']")).not.toBeNull();
  });

  it("shows guest Login and Sign Up links when unauthenticated", async () => {
    mockSession({ authenticated: false });
    render(<SiteHeader />);

    expect(await screen.findByRole("link", { name: /log in/i })).not.toBeNull();
    expect(screen.getByRole("link", { name: /sign up/i })).not.toBeNull();
  });

  it("does not show public auth links while an admin route session is loading", () => {
    usePathnameMock.mockReturnValue("/admin/classes");
    fetchMock.mockImplementation(() => new Promise(() => {}));

    render(<SiteHeader />);

    expect(screen.queryByRole("link", { name: /log in/i })).toBeNull();
    expect(screen.queryByRole("link", { name: /sign up/i })).toBeNull();
  });

  it("shows a Teacher Portal link for authenticated teachers", async () => {
    mockSession({
      authenticated: true,
      user: {
        uid: "teacher-1",
        email: "teacher@example.com",
        fullName: "Teacher One",
        role: "TEACHER",
      },
    });

    render(<SiteHeader />);

    expect(await screen.findByRole("link", { name: /teacher portal/i })).not.toBeNull();
    expect(screen.queryByRole("link", { name: /admin/i })).toBeNull();
  });

  it("shows a Student Portal link for authenticated students", async () => {
    mockSession({
      authenticated: true,
      user: {
        uid: "student-1",
        email: "student@example.com",
        fullName: "Student One",
        role: "STUDENT",
      },
    });

    render(<SiteHeader />);

    expect(await screen.findByRole("link", { name: /student portal/i })).not.toBeNull();
  });

  it("shows an Admin link for authenticated admins", async () => {
    mockSession({
      authenticated: true,
      user: {
        uid: "admin-1",
        email: "admin@example.com",
        fullName: "Admin One",
        role: "ADMIN",
      },
    });

    render(<SiteHeader />);

    expect(await screen.findByRole("link", { name: /admin/i })).not.toBeNull();
  });
});
