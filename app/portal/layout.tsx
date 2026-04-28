import { UserRole } from "@prisma/client";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { getPortalDashboardPath, getSession } from "@/lib/auth/session";

export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();

  return (
    <section className="section-shell">
      <div className="container space-y-6">
        <header className="rounded-xl border border-secondary bg-card p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h1 className="text-2xl font-semibold">Portal</h1>
            </div>
            <div className="flex flex-wrap gap-2">
              {session ? (
                <>
                  <Button asChild variant="secondary" size="sm">
                    <Link href="/portal">Overview</Link>
                  </Button>
                  <Button asChild variant="secondary" size="sm">
                    <Link href="/portal/schedule">Schedule</Link>
                  </Button>
                  {session.role === UserRole.ADMIN ? (
                    <Button asChild variant="secondary" size="sm">
                      <Link href={getPortalDashboardPath(UserRole.ADMIN)}>Admin</Link>
                    </Button>
                  ) : null}
                </>
              ) : (
                <Button asChild variant="secondary" size="sm">
                  <Link href="/portal/login">Log In</Link>
                </Button>
              )}
            </div>
          </div>
        </header>

        {children}
      </div>
    </section>
  );
}
