import type { Metadata } from "next";

import { PageHero } from "@/components/sections/page-hero";
import { SafeguardingSection } from "@/components/sections/safeguarding-section";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata: Metadata = {
  title: "About",
  description:
    "Learn about ULU Online School, our vision, mission, core values, and digital teaching approach.",
};

export default function AboutPage() {
  const coreValues = ["Excellence", "Integrity", "Innovation", "Discipline", "Global Mindset"];

  return (
    <>
      <PageHero
        title="About ULU Online School"
        description="ULU Online School is a modern digital learning institution designed to provide high-quality international education through structured online delivery."
      />
      <section className="section-shell">
        <div className="container grid gap-6 lg:grid-cols-[1.5fr_1fr]">
          <Card>
            <CardHeader>
              <CardTitle>Who We Are</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-sm text-muted-foreground">
              <p>
                We serve students seeking flexible, affordable, and globally recognized academic
                programs through live classes, recorded lessons, structured assessments, and
                personalized academic support.
              </p>
              <p>
                ULU offers the curriculum by Cambridge Assessment International Education through
                technology-enabled teaching and learner support.
              </p>
            </CardContent>
          </Card>

          <div className="grid gap-6">
            <Card>
              <CardHeader>
                <CardTitle>Vision</CardTitle>
              </CardHeader>
              <CardContent className="text-sm text-muted-foreground">
                To become a leading global online Cambridge school known for academic excellence and
                innovation.
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Mission</CardTitle>
              </CardHeader>
              <CardContent className="text-sm text-muted-foreground">
                To make internationally recognized education accessible, affordable, and flexible
                for students worldwide.
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      <section className="pb-16">
        <div className="container grid gap-6 lg:grid-cols-[1fr_1.5fr]">
          <Card>
            <CardHeader>
              <CardTitle>Core Values</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-2">
                {coreValues.map((value) => (
                  <Badge key={value} variant="secondary">
                    {value}
                  </Badge>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Founder&apos;s Message</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-sm text-muted-foreground">
              <p>
                At ULU Online School, we believe that quality education should not be limited by
                geography.
              </p>
              <p>
                Our goal is to prepare students for university, careers, and life through
                structured, exam-focused Cambridge learning supported by modern technology.
              </p>
            </CardContent>
          </Card>
        </div>
      </section>
      <SafeguardingSection />
    </>
  );
}
