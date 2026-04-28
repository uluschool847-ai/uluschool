import {
  BookOpenCheck,
  CalendarClock,
  CircleDot,
  GraduationCap,
  Target,
  Users,
} from "lucide-react";

import { whyChooseItems } from "@/lib/content";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const icons = [CircleDot, Users, GraduationCap, CalendarClock, Target, BookOpenCheck];

export function WhyChooseSection() {
  return (
    <section className="section-shell" id="why-ulu">
      <div className="container">
        <h2>Why Choose ULU?</h2>
        <p className="mt-3 max-w-3xl text-muted-foreground">
          Certified teachers, structured classes, and continuous assessment in a flexible online
          environment.
        </p>
        <div className="mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {whyChooseItems.map((item, index) => {
            const Icon = icons[index % icons.length];
            return (
              <Card key={item.title} className="rounded-[12px] border-secondary">
                <CardHeader className="pb-3">
                  <Icon className="h-5 w-5 text-primary" aria-hidden="true" />
                  <CardTitle className="pt-2 text-xl">{item.title}</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground">{item.description}</p>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>
    </section>
  );
}
