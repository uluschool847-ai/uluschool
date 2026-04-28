import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { PortalLoginForm } from "@/components/auth/portal-login-form";
import { PageHero } from "@/components/sections/page-hero";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getAdminPendingTwoFactor, getPortalRedirectPath, getSession } from "@/lib/auth/session";

export const metadata: Metadata = {
  title: "Portal Login",
  description: "Portal authentication for students, teachers, parents, and administrators.",
  robots: {
    index: false,
    follow: false,
  },
};

type PortalLoginPageProps = {
  searchParams?: Promise<{
    next?: string;
  }>;
};

export default async function PortalLoginPage({ searchParams }: PortalLoginPageProps) {
  const session = await getSession();
  const pendingAdminTwoFactor = await getAdminPendingTwoFactor();
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const nextPath = resolvedSearchParams?.next?.trim();
  const ssoLoginUrl = process.env.ADMIN_SSO_LOGIN_URL;
  const ssoEnabled = process.env.ADMIN_SSO_ENABLED === "true";
  const features = ["Class timetable", "Recorded lessons", "Homework upload", "Results dashboard"];

  if (session) {
    redirect(getPortalRedirectPath(session.role, nextPath));
  }

  return (
    <>
      <PageHero
        title="Portal Login"
        description="Secure access for students, teachers, parents, and admins."
      />
      <section className="section-shell">
        <div className="container grid gap-6 lg:grid-cols-[1fr_1fr]">
          <Card>
            <CardHeader>
              <CardTitle>{pendingAdminTwoFactor ? "Admin Verification" : "Login"}</CardTitle>
            </CardHeader>
            <CardContent>
              {pendingAdminTwoFactor ? (
                <div className="space-y-4">
                  <p className="text-sm text-muted-foreground">
                    Admin 2FA verification is pending for{" "}
                    <strong>{pendingAdminTwoFactor.email}</strong>.
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <Button asChild>
                      <Link href="/portal/login/verify-2fa">Continue 2FA</Link>
                    </Button>
                    <Button asChild variant="secondary">
                      <Link href="/portal/login">Back to Login</Link>
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  <PortalLoginForm nextPath={nextPath} />
                  {ssoEnabled && ssoLoginUrl ? (
                    <div className="border-t border-secondary pt-4">
                      <p className="mb-2 text-xs uppercase tracking-[0.12em] text-muted-foreground">
                        Organization SSO
                      </p>
                      <Button asChild variant="secondary">
                        <a href={ssoLoginUrl}>Continue with SSO</a>
                      </Button>
                    </div>
                  ) : null}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Portal Features</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="list-disc space-y-2 pl-5 text-sm text-muted-foreground">
                {features.map((feature) => (
                  <li key={feature}>{feature}</li>
                ))}
              </ul>
            </CardContent>
          </Card>
        </div>
      </section>
    </>
  );
}
