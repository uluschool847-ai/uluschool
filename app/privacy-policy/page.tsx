import type { Metadata } from "next";

import { PageHero } from "@/components/sections/page-hero";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description: "Privacy policy information for ULU Online School website visitors and enquiries.",
};

export default function PrivacyPolicyPage() {
  return (
    <>
      <PageHero
        title="Privacy Policy"
        description="This page outlines how ULU Online School handles website enquiries and contact information."
      />
      <section className="section-shell">
        <div className="container max-w-4xl space-y-4 text-sm text-muted-foreground">
          <p>
            ULU Online School collects information submitted through website forms to respond to
            enquiries, admissions requests, and trial class bookings.
          </p>
          <p>
            We use submitted contact information for communication related to your enquiry and
            student support. We do not share personal information with third parties except where
            required for service delivery or legal compliance.
          </p>
          <p>
            Contact the school directly if you want to request updates or deletion of submitted
            enquiry information.
          </p>
        </div>
      </section>
    </>
  );
}
