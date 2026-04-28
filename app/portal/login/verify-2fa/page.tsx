import type { Metadata } from "next";
import Link from "next/link";

import { TwoFactorForm } from "@/components/auth/two-factor-form";
import { PageHero } from "@/components/sections/page-hero";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getAdminPendingTwoFactor } from "@/lib/auth/session";

export const metadata: Metadata = {
  title: "Verify 2FA",
  description: "Complete admin two-factor authentication.",
  robots: {
    index: false,
    follow: false,
  },
};

export default async function VerifyTwoFactorPage({
  searchParams,
}: {
  searchParams?: Promise<{ next?: string }>;
}) {
  const pending = await getAdminPendingTwoFactor();
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const nextPath = resolvedSearchParams?.next?.trim();

  return (
    <>
      <PageHero
        title="Admin Verification"
        description="Enter your authenticator code to complete admin sign-in."
      />
      <section className="section-shell">
        <div className="container max-w-2xl">
          <Card>
            <CardHeader>
              <CardTitle>Two-Factor Authentication</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {pending ? (
                <>
                  <p className="text-sm text-muted-foreground">
                    Pending admin session for <strong>{pending.email}</strong>.
                  </p>
                  <TwoFactorForm nextPath={nextPath} />
                </>
              ) : (
                <>
                  <p className="text-sm text-muted-foreground">
                    2FA session is missing or expired. Please sign in again.
                  </p>
                  <Button asChild>
                    <Link href="/portal/login">Back to Login</Link>
                  </Button>
                </>
              )}
            </CardContent>
          </Card>
        </div>
      </section>
    </>
  );
}
