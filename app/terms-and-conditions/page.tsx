import type { Metadata } from "next";

import { PageHero } from "@/components/sections/page-hero";

export const metadata: Metadata = {
  title: "Terms & Conditions",
  description: "General website and admissions terms for ULU Online School.",
};

export default function TermsAndConditionsPage() {
  return (
    <>
      <PageHero
        title="Terms & Conditions"
        description="Binding terms for using ULU Online School services, admissions workflows, and online learning systems."
      />
      <section className="section-shell">
        <div className="container max-w-4xl space-y-4 text-sm text-muted-foreground">
          <p className="text-foreground">
            Effective date: April 21, 2026
          </p>
          <h2 className="text-xl font-semibold text-foreground">1. Scope</h2>
          <p>
            These terms govern access to ULU Online School website pages, forms, class scheduling,
            portal access, and school communication channels.
          </p>
          <h2 className="text-xl font-semibold text-foreground">2. Admissions and Placement</h2>
          <p>
            Admissions, placement decisions, fees, timetables, and programme availability may vary
            based on student assessment outcomes, class capacity, and operational policy updates.
          </p>
          <h2 className="text-xl font-semibold text-foreground">3. Fees and Payments</h2>
          <p>
            Quoted fees are payable according to the selected tuition plan. Late or failed payments
            may affect class access until balances are settled.
          </p>
          <h2 className="text-xl font-semibold text-foreground">4. Online Class Conduct</h2>
          <p>
            Students and guardians must use class platforms respectfully, keep account credentials
            private, and avoid sharing live lesson links with unauthorized users.
          </p>
          <h2 className="text-xl font-semibold text-foreground">5. Attendance and Scheduling</h2>
          <p>
            Families are responsible for attending scheduled lessons on time and notifying the school
            when rescheduling is needed.
          </p>
          <h2 className="text-xl font-semibold text-foreground">6. Assessment and Outcomes</h2>
          <p>
            ULU provides structured instruction and exam preparation. Final outcomes depend on
            student attendance, effort, and assessment performance.
          </p>
          <h2 className="text-xl font-semibold text-foreground">7. Cambridge Examination Notice</h2>
          <p>
            Cambridge examination registration and official requirements are subject to applicable
            Cambridge Assessment International Education regulations and approved centre processes.
          </p>
          <h2 className="text-xl font-semibold text-foreground">8. Service Availability</h2>
          <p>
            We target high service reliability but cannot guarantee uninterrupted availability of
            third-party platforms or internet connectivity.
          </p>
          <h2 className="text-xl font-semibold text-foreground">9. Limitation and Changes</h2>
          <p>
            ULU may update programmes, schedules, and systems as required for quality, safety, or
            compliance. Updated terms become effective when published on this page.
          </p>
          <h2 className="text-xl font-semibold text-foreground">10. Contact</h2>
          <p>
            Questions about these terms should be sent to <strong>info@uluglobalacademy.com</strong>.
          </p>
        </div>
      </section>
    </>
  );
}
