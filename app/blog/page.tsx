import type { Metadata } from "next";

import { PageHero } from "@/components/sections/page-hero";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata: Metadata = {
  title: "Blog",
  description:
    "ULU Online School blog categories covering Cambridge exam tips, study strategies, parent guidance, and online learning success.",
};

export default function BlogPage() {
  const sections = [
    {
      title: "Cambridge Exam Tips",
      description:
        "Revision planning, mock exam strategy, and exam technique for Cambridge learners.",
    },
    {
      title: "Study Strategies",
      description: "Practical study systems for consistency, focus, and independent learning.",
    },
    {
      title: "Parent Guidance Articles",
      description: "How families can support progress, routines, and accountability at home.",
    },
    {
      title: "Online Learning Success Tips",
      description:
        "Device setup, learning habits, and participation strategies for online classes.",
    },
  ];

  return (
    <>
      <PageHero
        title="Blog"
        description="Insights and guidance for students and parents in Cambridge online learning."
      />
      <section className="section-shell">
        <div className="container grid gap-4 md:grid-cols-2">
          {sections.map((section) => (
            <Card key={section.title}>
              <CardHeader>
                <CardTitle>{section.title}</CardTitle>
              </CardHeader>
              <CardContent className="text-sm text-muted-foreground">
                {section.description}
              </CardContent>
            </Card>
          ))}
        </div>
      </section>
    </>
  );
}
