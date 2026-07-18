import type { Metadata } from "next";

import { EnrolForm } from "@/components/enrol/enrol-form";
import { PageHero } from "@/components/sections/page-hero";
import { getCatalogueData } from "@/lib/repositories/catalogue-repository";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Enrol",
  description: "Book a free trial class and submit an enrolment enquiry for ULU Online School.",
};

export default async function EnrolPage() {
  const { subjects, levels } = await getCatalogueData();

  return (
    <>
      <PageHero
        title="Book a Free Trial Class"
        description="Complete this enrolment form to request a free trial class and receive a suitable class recommendation."
      />
      <section className="section-shell">
        <div className="container grid gap-8 lg:grid-cols-[2fr_1fr]">
          <EnrolForm subjects={subjects} levels={levels} />
          <aside className="prestige-surface h-fit space-y-4 p-6">
            <h2>What Happens Next</h2>
            <ol className="list-decimal space-y-2 pl-5 text-sm text-muted-foreground">
              <li>We review your parent and student profile details.</li>
              <li>We schedule your free trial class and initial assessment.</li>
              <li>You receive admission guidance, class placement, and next steps.</li>
            </ol>
            <p className="text-sm font-semibold text-primary">
              Looking for full admission requirements? Visit the Admissions page.
            </p>
          </aside>
        </div>
      </section>
    </>
  );
}
