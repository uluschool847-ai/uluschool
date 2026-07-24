"use client";

import { Menu, X } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

import { logoutPortal } from "@/app/student-portal/actions";
import { mainNavItems, mobileNavItems } from "@/lib/content";

import { Button } from "@/components/ui/button";

import { ThemeToggle } from "./theme-toggle";

type HeaderUser = {
  uid: string;
  email: string;
  fullName: string | null;
  role: string;
};

type HeaderSessionResponse =
  | {
      authenticated: true;
      user: HeaderUser;
    }
  | {
      authenticated: false;
    };

function getDisplayName(user: HeaderUser) {
  const fullName = user.fullName?.trim();
  if (fullName) {
    return fullName;
  }

  return user.email;
}

function getInitials(user: HeaderUser) {
  const fullName = user.fullName?.trim();
  if (fullName) {
    const parts = fullName.split(/\s+/).filter(Boolean);
    if (parts.length >= 2) {
      return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
    }
    return parts[0].slice(0, 2).toUpperCase();
  }

  return user.email.slice(0, 2).toUpperCase();
}

function HeaderUserInfo({ user }: { user: HeaderUser }) {
  const displayName = getDisplayName(user);
  const initials = getInitials(user);
  const hasName = Boolean(user.fullName?.trim());

  return (
    <div className="flex items-center gap-2 rounded-md border border-secondary bg-secondary/30 px-2 py-1.5">
      <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
        {initials}
      </span>
      <div className="max-w-[180px]">
        <p className="truncate text-sm font-medium text-primary">{displayName}</p>
        {hasName ? (
          <p className="truncate text-xs text-muted-foreground">{user.email}</p>
        ) : (
          <p className="truncate text-xs text-muted-foreground">{user.role.toLowerCase()}</p>
        )}
      </div>
    </div>
  );
}

function AdminDashboardLink({
  className = "",
  onClick,
}: {
  className?: string;
  onClick?: () => void;
}) {
  return (
    <Button asChild variant="secondary" size="sm" className={className}>
      <Link href="/admin" onClick={onClick}>
        Admin Dashboard
      </Link>
    </Button>
  );
}

function PortalLink({
  role,
  className = "",
  onClick,
}: {
  role: string;
  className?: string;
  onClick?: () => void;
}) {
  if (role === "ADMIN") {
    return <AdminDashboardLink className={className} onClick={onClick} />;
  }

  if (role === "TEACHER") {
    return (
      <Button asChild variant="secondary" size="sm" className={className}>
        <Link href="/portal/teacher" onClick={onClick} prefetch={false}>
          Teacher Portal
        </Link>
      </Button>
    );
  }

  if (role === "STUDENT") {
    return (
      <Button asChild variant="secondary" size="sm" className={className}>
        <Link href="/portal/student" onClick={onClick} prefetch={false}>
          Student Portal
        </Link>
      </Button>
    );
  }

  return (
    <Button asChild variant="secondary" size="sm" className={className}>
      <Link href="/portal" onClick={onClick} prefetch={false}>
        My Portal
      </Link>
    </Button>
  );
}

function UluLogo() {
  return (
    <Link href="/" className="flex items-center gap-3" aria-label="ULU Online School Home">
      <Image
        src="/ulu-logo.png"
        alt="ULU Online School logo"
        width={44}
        height={44}
        className="h-11 w-11 object-contain"
        priority
      />
      <span className="font-heading text-xl font-semibold tracking-wide">ULU Online School</span>
    </Link>
  );
}

export function SiteHeader() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [renderMobileMenu, setRenderMobileMenu] = useState(false);
  const [session, setSession] = useState<HeaderSessionResponse>({ authenticated: false });
  const [sessionLoaded, setSessionLoaded] = useState(false);
  const mobileMenuRef = useRef<HTMLDialogElement | null>(null);
  const menuButtonRef = useRef<HTMLButtonElement | null>(null);

  const focusMenuButton = useCallback(() => {
    window.setTimeout(() => {
      menuButtonRef.current?.focus();
    }, 0);
  }, []);

  const closeMobileMenu = useCallback(
    (returnFocus = false) => {
      setOpen(false);
      if (returnFocus) {
        focusMenuButton();
      }
    },
    [focusMenuButton],
  );

  // biome-ignore lint/correctness/useExhaustiveDependencies: pathname is intentionally used as a route-change trigger.
  useEffect(() => {
    closeMobileMenu();
  }, [closeMobileMenu, pathname]);

  useEffect(() => {
    if (open) {
      setRenderMobileMenu(true);
      return;
    }

    const timer = window.setTimeout(() => {
      setRenderMobileMenu(false);
    }, 180);

    return () => {
      window.clearTimeout(timer);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;

    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        closeMobileMenu(true);
      }
    }

    window.addEventListener("keydown", handleEscape);
    return () => {
      window.removeEventListener("keydown", handleEscape);
    };
  }, [closeMobileMenu, open]);

  useEffect(() => {
    function handleResize() {
      if (window.innerWidth >= 1024) {
        closeMobileMenu();
      }
    }

    window.addEventListener("resize", handleResize);
    return () => {
      window.removeEventListener("resize", handleResize);
    };
  }, [closeMobileMenu]);

  useEffect(() => {
    if (!open || !mobileMenuRef.current) return;

    const focusable = mobileMenuRef.current.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
    );
    const first = focusable[0];
    const last = focusable[focusable.length - 1];

    first?.focus();

    function handleTrap(event: KeyboardEvent) {
      if (event.key !== "Tab" || !first || !last) return;

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    mobileMenuRef.current.addEventListener("keydown", handleTrap);
    return () => {
      mobileMenuRef.current?.removeEventListener("keydown", handleTrap);
    };
  }, [open]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: pathname is intentionally used to refresh session on route changes.
  useEffect(() => {
    let active = true;

    async function loadSession() {
      try {
        const response = await fetch("/api/auth/session", {
          method: "GET",
          cache: "no-store",
          credentials: "include",
        });

        if (!response.ok) {
          throw new Error(`Session request failed (${response.status})`);
        }

        const payload = (await response.json()) as HeaderSessionResponse;
        if (active) {
          setSession(payload);
          setSessionLoaded(true);
        }
      } catch {
        if (active) {
          setSession({ authenticated: false });
          setSessionLoaded(true);
        }
      }
    }

    void loadSession();

    return () => {
      active = false;
    };
  }, [pathname]);

  const isAuthenticated = session.authenticated;
  const isAdminPath = pathname?.startsWith("/admin") ?? false;
  const showAuthenticatedActions = sessionLoaded && isAuthenticated;
  const showGuestActions = !isAdminPath && (!sessionLoaded || !isAuthenticated);

  return (
    <>
      <header className="sticky top-0 z-40 border-b border-secondary bg-background/95 backdrop-blur-xl">
        <a
          href="#main-content"
          className="sr-only absolute left-4 top-4 z-50 rounded-md bg-background px-4 py-2 text-sm font-medium text-primary shadow-sm focus:not-sr-only"
        >
          Skip to main content
        </a>
        <div className="container flex min-h-20 items-center justify-between gap-4">
          <UluLogo />

          <nav aria-label="Main navigation" className="hidden items-center gap-8 lg:flex">
            {mainNavItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="text-sm font-medium text-foreground/85 transition hover:text-primary"
              >
                {item.label}
              </Link>
            ))}
          </nav>

          <div className="hidden items-center gap-2 md:flex">
            {showAuthenticatedActions ? (
              <>
                <HeaderUserInfo user={session.user} />
                <PortalLink role={session.user.role} />
                <form action={logoutPortal}>
                  <Button
                    type="submit"
                    variant="ghost"
                    className="text-foreground/80 hover:text-primary"
                  >
                    Log Out
                  </Button>
                </form>
              </>
            ) : showGuestActions ? (
              <>
                <Button asChild variant="ghost" className="text-foreground/80 hover:text-primary">
                  <Link href="/portal/login">Log In</Link>
                </Button>
                <Button asChild>
                  <Link href="/admissions">Sign Up</Link>
                </Button>
              </>
            ) : null}
            <ThemeToggle />
          </div>

          <div className="flex items-center gap-2 md:hidden">
            <ThemeToggle />
            <Button
              ref={menuButtonRef}
              variant="secondary"
              size="icon"
              onClick={() => setOpen((value) => !value)}
              aria-label={open ? "Close menu" : "Open menu"}
              aria-expanded={open}
              aria-controls="mobile-nav-panel"
              aria-haspopup="dialog"
            >
              {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </Button>
          </div>
        </div>
      </header>

      {renderMobileMenu ? (
        <div
          className={`fixed inset-x-0 bottom-0 top-20 z-50 transition-opacity duration-200 md:hidden ${
            open ? "opacity-100" : "pointer-events-none opacity-0"
          }`}
        >
          <button
            type="button"
            className={`absolute inset-0 bg-background/70 backdrop-blur-sm transition-opacity duration-200 ${
              open ? "opacity-100" : "opacity-0"
            }`}
            aria-label="Close mobile menu"
            onClick={() => closeMobileMenu(true)}
          />

          <dialog
            ref={mobileMenuRef}
            open
            id="mobile-nav-panel"
            aria-modal="true"
            aria-label="Mobile navigation menu"
            className={`absolute left-4 right-4 top-4 max-h-[calc(100vh-7rem)] overflow-y-auto rounded-xl border border-secondary bg-background p-4 shadow-xl transition-all duration-200 ease-out ${
              open ? "translate-y-0 scale-100 opacity-100" : "-translate-y-2 scale-[0.98] opacity-0"
            }`}
          >
            <nav aria-label="Mobile navigation" className="flex flex-col gap-2">
              {mobileNavItems.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="rounded-md border border-secondary px-4 py-4 text-lg font-medium text-primary"
                  onClick={() => closeMobileMenu(true)}
                >
                  {item.label}
                </Link>
              ))}
            </nav>

            <div className="space-y-3 pt-6">
              {showAuthenticatedActions ? (
                <>
                  <HeaderUserInfo user={session.user} />
                  <PortalLink
                    role={session.user.role}
                    className="w-full"
                    onClick={() => closeMobileMenu(true)}
                  />
                  <form action={logoutPortal} onSubmit={() => closeMobileMenu(true)}>
                    <Button type="submit" variant="secondary" className="w-full">
                      Log Out
                    </Button>
                  </form>
                </>
              ) : showGuestActions ? (
                <>
                  <Button asChild variant="secondary" className="w-full">
                    <Link href="/portal/login" onClick={() => closeMobileMenu(true)}>
                      Log In
                    </Link>
                  </Button>
                  <Button asChild className="w-full">
                    <Link href="/admissions" onClick={() => closeMobileMenu(true)}>
                      Sign Up
                    </Link>
                  </Button>
                </>
              ) : null}
            </div>
          </dialog>
        </div>
      ) : null}
    </>
  );
}
