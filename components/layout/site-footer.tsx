import Link from "next/link";

import { siteConfig } from "@/lib/content";

export function SiteFooter() {
  return (
    <footer className="border-t border-secondary bg-secondary/45 py-12 dark:bg-card/40">
      <div className="container grid gap-8 md:grid-cols-3">
        <div>
          <h2 className="font-heading text-2xl text-primary">ULU Online School</h2>
          <p className="mt-3 max-w-xs text-sm text-muted-foreground">
            Education Without Borders. Structured Cambridge learning delivered fully online.
          </p>
        </div>

        <div>
          <h3 className="text-sm font-semibold uppercase tracking-[0.14em] text-primary">
            Contact
          </h3>
          <ul className="mt-3 space-y-1 text-sm text-muted-foreground">
            <li>Email: {siteConfig.contact.email}</li>
            <li>Phone: {siteConfig.contact.phone}</li>
            <li>WhatsApp: {siteConfig.contact.whatsapp}</li>
          </ul>
        </div>

        <div>
          <h3 className="text-sm font-semibold uppercase tracking-[0.14em] text-primary">
            Explore
          </h3>
          <div className="mt-3 flex flex-wrap gap-3 text-sm">
            <Link className="text-muted-foreground hover:text-primary" href="/about">
              About ULU
            </Link>
            <Link className="text-muted-foreground hover:text-primary" href="/admissions">
              Admissions
            </Link>
            <Link className="text-muted-foreground hover:text-primary" href="/curriculum">
              Curriculum
            </Link>
            <Link className="text-muted-foreground hover:text-primary" href="/contact">
              Contact
            </Link>
            <Link className="text-muted-foreground hover:text-primary" href="/privacy-policy">
              Privacy Policy
            </Link>
            <Link className="text-muted-foreground hover:text-primary" href="/terms-and-conditions">
              Terms &amp; Conditions
            </Link>
          </div>
        </div>
      </div>
      <p className="container mt-10 text-xs text-muted-foreground">
        &copy; {new Date().getFullYear()} ULU Online School. All Rights Reserved.
      </p>
    </footer>
  );
}
