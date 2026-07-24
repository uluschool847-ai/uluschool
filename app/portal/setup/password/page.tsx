import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { InitialPasswordForm } from "@/components/auth/InitialPasswordForm";
import { PageHero } from "@/components/sections/page-hero";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getInitialSetupSession } from "@/lib/auth/session";
import { findUserForInitialSetup } from "@/lib/repositories/user-repository";

export const metadata: Metadata = {
  title: "Change Initial Password",
  description: "Replace the temporary password before entering the school portal.",
  robots: {
    index: false,
    follow: false,
  },
};

export default async function InitialPasswordSetupPage() {
  const setup = await getInitialSetupSession();
  if (!setup) {
    redirect("/portal/login");
  }

  const user = await findUserForInitialSetup(setup.uid);
  if (!user || !user.isActive || user.id !== setup.uid || user.role !== setup.role) {
    redirect("/portal/login");
  }

  if (!user.mustChangePassword) {
    redirect("/portal/login");
  }

  return (
    <>
      <PageHero
        title="Change Your Password"
        description="Replace your temporary password before continuing to the portal."
      />
      <section className="section-shell">
        <div className="container max-w-2xl">
          <Card>
            <CardHeader>
              <CardTitle>Set a New Password</CardTitle>
            </CardHeader>
            <CardContent>
              <InitialPasswordForm />
            </CardContent>
          </Card>
        </div>
      </section>
    </>
  );
}
