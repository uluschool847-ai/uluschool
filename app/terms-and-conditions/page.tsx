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
        description="General terms for using the ULU Online School website and making admissions enquiries."
      />
      <section className="section-shell">
        <div className="container max-w-4xl space-y-4 text-sm text-muted-foreground">
          <p>
            Information on this website is provided for general guidance on ULU Online School
            programmes, admissions, fees, and contact channels.
          </p>
          <p>
            Admissions, placement decisions, fees, timetables, and programme availability may vary
            based on student assessment, subject demand, and school policies.
          </p>
          <p>
            Cambridge examination registration and official requirements are subject to applicable
            Cambridge Assessment International Education regulations and approved centre processes.
          </p>
        </div>
      </section>
    </>
  );
}
