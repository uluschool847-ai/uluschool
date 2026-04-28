import type { Metadata } from "next";
import Link from "next/link";

import { PageHero } from "@/components/sections/page-hero";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata: Metadata = {
  title: "Admissions",
  description:
    "Review the ULU Online School admission process, required documents, and term dates.",
};

export default function AdmissionsPage() {
  const steps = [
    "Submit online application",
    "Student assessment test",
    "Virtual interview",
    "Enrollment confirmation",
  ];

  const documents = [
    "Birth certificate or passport copy",
    "Previous school report",
    "Passport-size photo",
  ];

  const termDates = [
    "Term 1: January - March",
    "Term 2: May - July",
    "Term 3: September - November",
  ];

  return (
    <>
      <PageHero
        title="Admissions"
        description="Apply to ULU Online School through our structured admissions process for Cambridge online learning."
      />
      <section className="section-shell">
        <div className="container grid gap-6 lg:grid-cols-3">
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle>Admission Process</CardTitle>
            </CardHeader>
            <CardContent>
              <ol className="list-decimal space-y-2 pl-5 text-sm text-muted-foreground">
                {steps.map((step) => (
                  <li key={step}>{step}</li>
                ))}
              </ol>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Apply or Book a Trial</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <Button asChild className="w-full">
                <Link href="/enrol">Book Free Trial Class</Link>
              </Button>
              <Button asChild variant="secondary" className="w-full">
                <Link href="/contact">Contact Admissions</Link>
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Required Documents</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="list-disc space-y-2 pl-5 text-sm text-muted-foreground">
                {documents.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </CardContent>
          </Card>

          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle>Term Dates</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="mb-3 text-sm text-muted-foreground">Three academic terms per year:</p>
              <ul className="grid gap-3 md:grid-cols-3">
                {termDates.map((term) => (
                  <li
                    key={term}
                    className="rounded-md border border-secondary px-3 py-3 text-sm text-muted-foreground"
                  >
                    {term}
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        </div>
      </section>
    </>
  );
}
