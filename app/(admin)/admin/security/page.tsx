import { UserRole } from "@prisma/client";
import type { Metadata } from "next";
import Link from "next/link";

import { TwoFactorSettings } from "@/components/admin/two-factor-settings";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireRole } from "@/lib/auth/session";
import { findAdminUserForTwoFactor } from "@/lib/repositories/user-repository";

export const metadata: Metadata = {
  title: "Admin Security",
  robots: {
    index: false,
    follow: false,
  },
};

type AdminSecurityPageProps = {
  searchParams?:
    | Promise<{
        setup2fa?: string;
        next?: string;
      }>
    | {
        setup2fa?: string;
        next?: string;
      };
};

function getSafeAdminPath(path?: string) {
  if (!path || !path.startsWith("/admin") || path.startsWith("//")) {
    return "/admin";
  }

  return path;
}

export default async function AdminSecurityPage({ searchParams = {} }: AdminSecurityPageProps) {
  const session = await requireRole([UserRole.ADMIN]);
  const resolvedSearchParams = await searchParams;
  const isSetupRedirect = resolvedSearchParams.setup2fa === "required";
  const adminTwoFactorRequired = (process.env.ADMIN_REQUIRE_2FA ?? "true") !== "false";
  const dashboardPath = getSafeAdminPath(resolvedSearchParams.next);
  let admin = null;

  try {
    admin = await findAdminUserForTwoFactor(session.uid);
  } catch (error) {
    console.error("Failed to load admin security settings:", error);
  }

  return (
    <div className="space-y-4">
      <header className="space-y-3">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Admin Security</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            This page controls production hardening for administrator access. Keep 2FA enabled for
            every production administrator.
          </p>
        </div>
        {isSetupRedirect && adminTwoFactorRequired ? (
          <Button asChild size="sm">
            <Link href="#two-factor-setup">Set up 2FA below</Link>
          </Button>
        ) : (
          <Button asChild size="sm" variant="secondary">
            <Link href={dashboardPath}>Continue to Admin Dashboard</Link>
          </Button>
        )}
      </header>

      {isSetupRedirect && adminTwoFactorRequired ? (
        <Card className="border-amber-200 bg-amber-50">
          <CardHeader>
            <CardTitle>2FA setup is required</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-amber-900">
            <p>
              You were redirected here after password login because{" "}
              <code>ADMIN_REQUIRE_2FA=true</code> and this admin account does not have 2FA enabled
              yet.
            </p>
            <p>
              Local development uses a controlled setup bypass so you can finish enabling 2FA. In
              production, admin login is blocked until 2FA is already configured.
            </p>
          </CardContent>
        </Card>
      ) : null}

      {!adminTwoFactorRequired ? (
        <Card className="border-sky-200 bg-sky-50">
          <CardHeader>
            <CardTitle>2FA setup is optional in this environment</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-sky-900">
            <p>
              <code>ADMIN_REQUIRE_2FA=false</code> is active, so admin password login can continue
              to the dashboard for local or demo work. You can still enable 2FA below.
            </p>
            <Button asChild size="sm">
              <Link href={dashboardPath}>Continue to Admin Dashboard</Link>
            </Button>
          </CardContent>
        </Card>
      ) : null}

      <Card id="two-factor-setup">
        <CardHeader>
          <CardTitle>Two-Factor Authentication (TOTP)</CardTitle>
        </CardHeader>
        <CardContent>
          {admin ? (
            <TwoFactorSettings enabled={admin.twoFactorEnabled} />
          ) : (
            <p className="text-sm text-destructive">
              Unable to load admin account security settings.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
