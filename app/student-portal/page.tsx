import type { Metadata } from "next";
import Link from "next/link";

import { getPortalSession, logoutPortal } from "@/app/student-portal/actions";
import { getAdminPendingTwoFactor } from "@/lib/auth/session";
import { PortalLoginForm } from "@/components/auth/portal-login-form";
import { PageHero } from "@/components/sections/page-hero";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata: Metadata = {
  title: "Student Portal",
  description:
    "Student portal login and feature overview for timetable, recorded lessons, assignments, and results.",
  robots: {
    index: false,
    follow: false,
  },
};

export default async function StudentPortalPage() {
  const session = await getPortalSession();
  const pendingAdminTwoFactor = await getAdminPendingTwoFactor();
  const ssoLoginUrl = process.env.ADMIN_SSO_LOGIN_URL;
  const ssoEnabled = process.env.ADMIN_SSO_ENABLED === "true";
  const features = [
    "Class timetable",
    "Recorded lessons",
    "Homework upload",
    "Results dashboard",
  ];

  return (
    <>
      <PageHero
        title="Student Portal"
        description="Secure student access for class schedules, recorded lessons, assignments, and results."
      />
      <section className="section-shell">
        <div className="container grid gap-6 lg:grid-cols-[1fr_1fr]">
          <Card>
            <CardHeader>
              <CardTitle>{session ? "Session Active" : "Login"}</CardTitle>
            </CardHeader>
            <CardContent>
              {session ? (
                <div className="space-y-3">
                  <p className="text-sm text-muted-foreground">
                    Logged in as <strong>{session.email}</strong> ({session.role.toLowerCase()}).
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <Button asChild>
                      <Link href={session.role === "ADMIN" ? "/admin" : "/portal"}>
                        Continue
                      </Link>
                    </Button>
                    <form action={logoutPortal}>
                      <Button type="submit" variant="secondary">
                        Logout
                      </Button>
                    </form>
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  {pendingAdminTwoFactor ? (
                    <div className="rounded-md border border-secondary p-3 text-sm text-muted-foreground">
                      Admin 2FA verification is pending for <strong>{pendingAdminTwoFactor.email}</strong>.
                      <div className="mt-2">
                        <Button asChild size="sm">
                          <Link href="/student-portal/verify-2fa">Continue 2FA</Link>
                        </Button>
                      </div>
                    </div>
                  ) : null}
                  <PortalLoginForm />
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
