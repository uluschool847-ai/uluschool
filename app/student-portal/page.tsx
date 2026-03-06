import type { Metadata } from "next";

import { PageHero } from "@/components/sections/page-hero";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const metadata: Metadata = {
  title: "Student Portal",
  description:
    "Student portal login and feature overview for timetable, recorded lessons, assignments, and results.",
};

export default function StudentPortalPage() {
  const features = [
    "Class timetable",
    "Recorded lessons",
    "Homework upload",
    "Results dashboard",
  ];

  return (
    <>
      <PageHero
        title="Student Portal"
        description="Secure student access for class schedules, recorded lessons, assignments, and results."
      />
      <section className="section-shell">
        <div className="container grid gap-6 lg:grid-cols-[1fr_1fr]">
          <Card>
            <CardHeader>
              <CardTitle>Login</CardTitle>
            </CardHeader>
            <CardContent>
              <form className="grid gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="studentEmail">Student Email</Label>
                  <Input id="studentEmail" type="email" placeholder="student@ulu..." />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="studentPassword">Password</Label>
                  <Input id="studentPassword" type="password" placeholder="Password" />
                </div>
                <Button type="submit" className="w-fit">
                  Login
                </Button>
              </form>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Portal Features</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="list-disc space-y-2 pl-5 text-sm text-muted-foreground">
                {features.map((feature) => (
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
