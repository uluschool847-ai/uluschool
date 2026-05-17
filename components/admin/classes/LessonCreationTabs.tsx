"use client";

import { useState } from "react";

import { LessonForm } from "@/components/admin/classes/LessonForm";
import { RecurringLessonsForm } from "@/components/admin/classes/RecurringLessonsForm";
import { Button } from "@/components/ui/button";

type Option = { id: string; fullName?: string; email?: string; name?: string; slug?: string };

type LessonCreationTabsProps = {
  classGroup: { id: string; name: string };
  teachers: Option[];
  subjects: Option[];
};

export function LessonCreationTabs({ classGroup, teachers, subjects }: LessonCreationTabsProps) {
  const [activeTab, setActiveTab] = useState<"single" | "recurring">("single");

  return (
    <div className="space-y-4">
      <div role="tablist" aria-label="Lesson creation mode" className="flex flex-wrap gap-2">
        <Button
          type="button"
          role="tab"
          aria-selected={activeTab === "single"}
          variant={activeTab === "single" ? "default" : "secondary"}
          onClick={() => setActiveTab("single")}
        >
          Single lesson
        </Button>
        <Button
          type="button"
          role="tab"
          aria-selected={activeTab === "recurring"}
          variant={activeTab === "recurring" ? "default" : "secondary"}
          onClick={() => setActiveTab("recurring")}
        >
          Recurring
        </Button>
      </div>

      {activeTab === "single" ? (
        <LessonForm mode="create" classGroup={classGroup} teachers={teachers} subjects={subjects} />
      ) : (
        <RecurringLessonsForm classGroup={classGroup} teachers={teachers} subjects={subjects} />
      )}
    </div>
  );
}
