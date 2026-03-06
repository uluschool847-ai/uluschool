"use client";

import { Menu, X } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

import { mainNavItems, mobileNavItems } from "@/lib/content";

import { Button } from "@/components/ui/button";

import { ThemeToggle } from "./theme-toggle";

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

  useEffect(() => {
    if (open && pathname !== undefined) {
      setOpen(false);
    }
  }, [open, pathname]);

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
            <Button asChild variant="ghost" className="text-foreground/80 hover:text-primary">
              <Link href="/student-portal">Log In</Link>
            </Button>
            <Button asChild>
              <Link href="/admissions">Enroll Now</Link>
            </Button>
            <ThemeToggle />
          </div>

          <div className="flex items-center gap-2 md:hidden">
            <ThemeToggle />
            <Button
              variant="secondary"
              size="icon"
              onClick={() => setOpen(true)}
              aria-label="Open menu"
            >
              <Menu className="h-5 w-5" />
            </Button>
          </div>
        </div>
      </header>

      {open ? (
        <dialog
          open
          className="fixed inset-0 z-50 flex h-screen w-screen flex-col bg-background p-6"
        >
          <div className="flex items-center justify-between">
            <UluLogo />
            <Button
              variant="secondary"
              size="icon"
              onClick={() => setOpen(false)}
              aria-label="Close menu"
            >
              <X className="h-5 w-5" />
            </Button>
          </div>

          <nav aria-label="Mobile navigation" className="mt-10 flex flex-1 flex-col gap-2">
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

          <div className="pt-6">
            <Button asChild className="w-full">
              <Link href="/admissions" onClick={() => setOpen(false)}>
                Enroll Now
              </Link>
            </Button>
          </div>
        </dialog>
      ) : null}
    </>
  );
}
