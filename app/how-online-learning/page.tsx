import type { Metadata } from "next";

import { PageHero } from "@/components/sections/page-hero";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata: Metadata = {
  title: "How Online Learning Works",
  description:
    "Learn how ULU Online School delivers live classes, recorded lessons, student portal access, and parent reporting.",
};

export default function HowOnlineLearningPage() {
  const studentPortalFeatures = [
    "Personal login",
    "Class timetable",
    "Assignment submission area",
    "Grade reports",
    "Downloadable notes",
  ];

  const parentPortalFeatures = [
    "Monitor attendance",
    "Track performance",
    "Receive term reports",
    "Communicate with teachers",
  ];

  return (
    <>
      <PageHero
        title="How Online Learning Works"
        description="ULU delivers structured online learning through live interactive classes, recorded lessons, and secure portal access for students and parents."
      />
      <section className="section-shell">
        <div className="container grid gap-5 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Live Interactive Classes</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              Students attend scheduled live sessions with subject teachers.
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Recorded Lessons</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              All lessons are recorded and stored for revision access.
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Student Portal</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
                {studentPortalFeatures.map((feature) => (
                  <li key={feature}>{feature}</li>
                ))}
              </ul>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Parent Portal</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
                {parentPortalFeatures.map((feature) => (
                  <li key={feature}>{feature}</li>
                ))}
              </ul>
            </CardContent>
          </Card>
        </div>
      </section>
    </>
  );
}
