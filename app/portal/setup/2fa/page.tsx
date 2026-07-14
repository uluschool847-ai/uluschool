import { UserRole } from "@prisma/client";
import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { InitialTwoFactorForm } from "@/components/auth/InitialTwoFactorForm";
import { PageHero } from "@/components/sections/page-hero";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getInitialSetupSession, getPortalRedirectPath, getSession } from "@/lib/auth/session";
import { findUserForInitialSetup } from "@/lib/repositories/user-repository";

export const metadata: Metadata = {
  title: "Secure Administrator Account",
  description: "Enroll an authenticator before entering the administrator portal.",
  robots: {
    index: false,
    follow: false,
  },
};

export default async function InitialTwoFactorSetupPage() {
  const setup = await getInitialSetupSession();
  let requiresHandoff = false;
  let completedHref: string | undefined;

  if (!setup) {
    const session = await getSession();
    if (!session || session.role !== UserRole.ADMIN || !session.mfaVerified) {
      redirect("/portal/login");
    }

    completedHref = getPortalRedirectPath(UserRole.ADMIN);
  } else {
    if (setup.role !== UserRole.ADMIN) {
      redirect("/portal/unauthorized");
    }

    const user = await findUserForInitialSetup(setup.uid);
    if (!user || !user.isActive || user.id !== setup.uid || user.email !== setup.email) {
      redirect("/portal/login");
    }

    if (user.role !== UserRole.ADMIN || user.role !== setup.role) {
      redirect("/portal/unauthorized");
    }

    if (user.mustChangePassword) {
      redirect("/portal/setup/password");
    }

    requiresHandoff = user.twoFactorEnabled;
  }

  return (
    <>
      <PageHero
        title="Secure Your Administrator Account"
        description="Add an authenticator before continuing to the administrator portal."
      />
      <section className="section-shell">
        <div className="container max-w-2xl">
          <Card>
            <CardHeader>
              <CardTitle>Two-Factor Authentication</CardTitle>
            </CardHeader>
            <CardContent>
              <InitialTwoFactorForm
                requiresHandoff={requiresHandoff}
                completedHref={completedHref}
              />
            </CardContent>
          </Card>
        </div>
      </section>
    </>
  );
}
