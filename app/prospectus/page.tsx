import type { Metadata } from "next";
import Link from "next/link";

import { PageHero } from "@/components/sections/page-hero";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata: Metadata = {
  title: "Prospectus",
  description: "ULU mini prospectus content for programme overview, teaching approach, assessment, and technology platform.",
};

export default function ProspectusPage() {
  const teachingApproach = [
    "Live interactive classes",
    "Small class sizes",
    "Recorded lessons access",
    "Continuous feedback",
    "Parent progress reports",
    "Exam-focused strategy",
  ];

  const assessment = ["Weekly quizzes", "Monthly tests", "Term examinations", "Mock IGCSE exams"];

  const platform = [
    "Live video classes",
    "Learning portal access",
    "Downloadable materials",
    "Secure student accounts",
  ];

  return (
    <>
      <PageHero
        title="ULU Mini Prospectus"
        description="A concise overview of ULU Online School programmes, teaching model, and student experience."
      />
      <section className="section-shell">
        <div className="container grid gap-6">
          <Card>
            <CardHeader>
              <CardTitle>About ULU</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm text-muted-foreground">
              <p>
                ULU Online School is a fully virtual Cambridge learning institution designed to
                provide structured, affordable, and internationally competitive education.
              </p>
              <p>
                Vision: To become Africa&apos;s leading online Cambridge school.
              </p>
              <p>
                Mission: To provide accessible, high-quality international education through
                technology.
              </p>
            </CardContent>
          </Card>

          <div className="grid gap-6 lg:grid-cols-3">
            <Card>
              <CardHeader>
                <CardTitle>Teaching Approach</CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="list-disc space-y-2 pl-5 text-sm text-muted-foreground">
                  {teachingApproach.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Assessment</CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="list-disc space-y-2 pl-5 text-sm text-muted-foreground">
                  {assessment.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Technology Platform</CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="list-disc space-y-2 pl-5 text-sm text-muted-foreground">
                  {platform.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          </div>

          <div className="prestige-surface p-6">
            <p className="text-sm text-muted-foreground">
              Need a branded PDF version? Request the full professional prospectus from the ULU team.
            </p>
            <div className="mt-4">
              <Button asChild>
                <Link href="/contact">Contact Us</Link>
              </Button>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
