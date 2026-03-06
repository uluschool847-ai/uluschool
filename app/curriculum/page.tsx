import type { Metadata } from "next";

import { PageHero } from "@/components/sections/page-hero";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata: Metadata = {
  title: "Curriculum",
  description:
    "Explore ULU's Cambridge curriculum pathways across Primary, Lower Secondary, and IGCSE.",
};

export default function CurriculumPage() {
  const programmes = [
    {
      title: "Primary (Years 1-6)",
      subjects: ["English", "Mathematics", "Science", "Global Perspectives", "ICT (optional)"],
      focus: [
        "Strong academic foundation",
        "Reading and writing fluency",
        "Problem-solving skills",
      ],
      assessment: ["Weekly quizzes", "Monthly progress tests", "Term exams"],
    },
    {
      title: "Lower Secondary (Years 7-9)",
      subjects: [
        "English",
        "Mathematics",
        "Biology",
        "Chemistry",
        "Physics",
        "Geography",
        "ICT",
        "Global Perspectives",
      ],
      focus: [
        "Analytical thinking",
        "Exam preparation skills",
        "Subject specialization readiness",
      ],
      assessment: ["Weekly quizzes", "Monthly tests", "Term examinations"],
    },
    {
      title: "IGCSE (Years 10-11)",
      subjects: [
        "Mathematics",
        "English Language",
        "Biology",
        "Chemistry",
        "Physics",
        "Business Studies",
        "ICT",
        "Geography",
      ],
      focus: ["Full subject preparation aligned with Cambridge standards"],
      assessment: [
        "Coursework (where required)",
        "Mock examinations",
        "Final Cambridge examinations",
      ],
    },
  ];

  return (
    <>
      <PageHero
        title="Cambridge Curriculum"
        description="ULU follows the curriculum developed by Cambridge Assessment International Education."
      />
      <section className="section-shell">
        <div className="container grid gap-5">
          {programmes.map((programme) => (
            <Card key={programme.title}>
              <CardHeader>
                <CardTitle>{programme.title}</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-5 lg:grid-cols-3">
                <div>
                  <p className="text-sm font-medium text-primary">Subjects</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {programme.subjects.map((subject) => (
                      <Badge key={subject} variant="outline" className="border-primary/20 text-primary">
                        {subject}
                      </Badge>
                    ))}
                  </div>
                </div>
                <div>
                  <p className="text-sm font-medium text-primary">Focus</p>
                  <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-muted-foreground">
                    {programme.focus.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </div>
                <div>
                  <p className="text-sm font-medium text-primary">Assessment</p>
                  <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-muted-foreground">
                    {programme.assessment.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>
    </>
  );
}
