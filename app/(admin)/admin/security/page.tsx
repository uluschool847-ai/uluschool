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

export default async function AdminSecurityPage() {
  const session = await requireRole([UserRole.ADMIN]);
  let admin = null;

  try {
    admin = await findAdminUserForTwoFactor(session.uid);
  } catch (error) {
    console.error("Failed to load admin security settings:", error);
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Admin Security</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-muted-foreground">
          <p>
            This page controls production hardening for admin access. Keep 2FA enabled in production
            and prefer SSO for organization-managed identity.
          </p>
          <Button asChild size="sm" variant="secondary">
            <Link href="/admin">Back to Admin</Link>
          </Button>
        </CardContent>
      </Card>

      <Card>
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

      <Card>
        <CardHeader>
          <CardTitle>SSO Callback</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <p>
            SSO callback endpoint: <code>/api/auth/sso/callback</code>
          </p>
          <p>
            Enable with env: <code>ADMIN_SSO_ENABLED=true</code> and configure shared secret.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
