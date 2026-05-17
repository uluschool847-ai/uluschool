import type { Metadata } from "next";
import Link from "next/link";

import { PageHero } from "@/components/sections/page-hero";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata: Metadata = {
  title: "Fees",
  description:
    "Tuition structure for ULU Online School with payment terms, additional costs, and family support options.",
};

export default function FeesPage() {
  const tuition = [
    { level: "Primary", price: "$100 per month" },
    { level: "Lower Secondary", price: "$150 per month" },
    { level: "IGCSE", price: "$200 per month" },
  ];

  const additionalCosts = [
    "Registration fee",
    "Exam registration fee (Cambridge)",
    "Learning materials (if applicable)",
  ];

  const discounts = ["Sibling discount", "Early payment discount"];
  const paymentMethods = ["Bank transfer", "Mobile money", "International transfer"];

  return (
    <>
      <PageHero
        title="Fees"
        description="Transparent tuition guidance for Cambridge online learning, including payment timing, enrolment costs, and support options for families."
      />
      <section className="section-shell">
        <div className="container grid gap-5 md:grid-cols-3">
          {tuition.map((plan) => (
            <Card key={plan.level}>
              <CardHeader>
                <CardTitle>{plan.level}</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-semibold text-primary">{plan.price}</p>
                <p className="mt-2 text-sm text-muted-foreground">
                  Monthly tuition covers scheduled live teaching, lesson recordings, progress
                  updates, and routine academic support for this level.
                </p>
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="container mt-8 grid gap-5 lg:grid-cols-3">
          <Card>
            <CardHeader>
              <CardTitle>Additional Costs</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="list-disc space-y-2 pl-5 text-sm text-muted-foreground">
                {additionalCosts.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Discounts</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="list-disc space-y-2 pl-5 text-sm text-muted-foreground">
                {discounts.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Payment Methods</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="list-disc space-y-2 pl-5 text-sm text-muted-foreground mb-4">
                {paymentMethods.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
              <div className="rounded-md border border-primary/20 bg-primary/5 p-3 text-sm text-primary font-medium">
                Note: Fees can still be paid monthly even though learning is organized by terms.
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="container mt-8">
          <div className="prestige-surface p-6">
            <p className="text-sm text-muted-foreground">
              Fees are confirmed after admissions review so the school can match subject load,
              timetable needs, and any extra learner support before issuing the final plan.
            </p>
            <div className="mt-4 flex flex-wrap gap-3">
              <Button asChild>
                <Link href="/admissions">Apply Now</Link>
              </Button>
              <Button asChild variant="secondary">
                <Link href="/contact">Contact Us</Link>
              </Button>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
