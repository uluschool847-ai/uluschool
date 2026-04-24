"use client";

import { Menu, X } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

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

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

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
        setOpen(false);
      }
    }

    window.addEventListener("keydown", handleEscape);
    return () => {
      window.removeEventListener("keydown", handleEscape);
    };
  }, [open]);

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
  const isAdmin = isAuthenticated && session.user.role === "ADMIN";

  return (
    <>
      <header className="sticky top-0 z-40 border-b border-secondary bg-background/95 backdrop-blur-xl">
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
            {sessionLoaded && isAuthenticated ? (
              <>
                <HeaderUserInfo user={session.user} />
                {isAdmin ? <AdminDashboardLink /> : null}
                <form action={logoutPortal}>
                  <Button type="submit" variant="ghost" className="text-foreground/80 hover:text-primary">
                    Log Out
                  </Button>
                </form>
              </>
            ) : (
              <>
                <Button asChild variant="ghost" className="text-foreground/80 hover:text-primary">
                  <Link href="/student-portal">Log In</Link>
                </Button>
                <Button asChild>
                  <Link href="/admissions">Enroll Now</Link>
                </Button>
              </>
            )}
            <ThemeToggle />
          </div>

          <div className="flex items-center gap-2 md:hidden">
            <ThemeToggle />
            <Button
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
            onClick={() => setOpen(false)}
          />

          <section
            id="mobile-nav-panel"
            role="dialog"
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
                  onClick={() => setOpen(false)}
                >
                  {item.label}
                </Link>
              ))}
            </nav>

            <div className="space-y-3 pt-6">
              {sessionLoaded && isAuthenticated ? (
                <>
                  <HeaderUserInfo user={session.user} />
                  {isAdmin ? (
                    <AdminDashboardLink className="w-full" onClick={() => setOpen(false)} />
                  ) : (
                    <Button asChild variant="secondary" className="w-full">
                      <Link href="/portal" onClick={() => setOpen(false)}>
                        My Portal
                      </Link>
                    </Button>
                  )}
                  <form action={logoutPortal} onSubmit={() => setOpen(false)}>
                    <Button type="submit" variant="secondary" className="w-full">
                      Log Out
                    </Button>
                  </form>
                </>
              ) : (
                <>
                  <Button asChild variant="secondary" className="w-full">
                    <Link href="/student-portal" onClick={() => setOpen(false)}>
                      Log In
                    </Link>
                  </Button>
                  <Button asChild className="w-full">
                    <Link href="/admissions" onClick={() => setOpen(false)}>
                      Enroll Now
                    </Link>
                  </Button>
                </>
              )}
            </div>
          </section>
        </div>
      ) : null}
    </>
  );
}
