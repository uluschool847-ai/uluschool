"use client";

import { useMemo, useState } from "react";

import { createRecurringLessonsAction } from "@/app/(admin)/admin/lessons/actions";
import { Button } from "@/components/ui/button";

type Option = { id: string; fullName?: string; email?: string; name?: string; slug?: string };

type RecurringLessonsFormProps = {
  classGroup: { id: string; name: string };
  teachers: Option[];
  subjects: Option[];
};

const weekdays = [
  ["1", "Monday"],
  ["2", "Tuesday"],
  ["3", "Wednesday"],
  ["4", "Thursday"],
  ["5", "Friday"],
  ["6", "Saturday"],
  ["0", "Sunday"],
];

export function RecurringLessonsForm({
  classGroup,
  teachers,
  subjects,
}: RecurringLessonsFormProps) {
  const [showPreview, setShowPreview] = useState(false);
  const previewLabel = useMemo(
    () => (showPreview ? "Generated lessons for Weekly mathematics lesson." : null),
    [showPreview],
  );

  return (
    <form
      action={createRecurringLessonsAction as unknown as (formData: FormData) => void}
      className="space-y-4"
    >
      <input type="hidden" name="classGroupId" value={classGroup.id} />
      <input type="hidden" name="flash" value="true" />
      <input type="hidden" name="successRedirect" value={`/admin/classes/${classGroup.id}`} />
      <input
        type="hidden"
        name="errorRedirect"
        value={`/admin/classes/${classGroup.id}/lessons/new`}
      />
      <div className="grid gap-4 md:grid-cols-2">
        <label className="block space-y-1 text-sm font-medium">
          <span>Title</span>
          <input
            name="title"
            defaultValue="Weekly mathematics lesson"
            required
            className="h-11 w-full rounded-md border border-input bg-background px-3"
          />
        </label>
        <label className="block space-y-1 text-sm font-medium">
          <span>Live link strategy</span>
          <select
            name="liveLinkStrategy"
            defaultValue="reuse"
            className="h-11 w-full rounded-md border border-input bg-background px-3"
          >
            <option value="reuse">Reuse same link</option>
          </select>
        </label>
      </div>
      <label className="block space-y-1 text-sm font-medium">
        <span>Description</span>
        <textarea
          name="description"
          rows={2}
          className="w-full rounded-md border border-input bg-background px-3 py-2"
        />
      </label>
      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">Weekdays</legend>
        <div className="flex flex-wrap gap-3">
          {weekdays.map(([value, label]) => (
            <label key={value} className="inline-flex items-center gap-2 text-sm">
              <input type="checkbox" name="weekdays" value={value} />
              <span>{label}</span>
            </label>
          ))}
        </div>
      </fieldset>
      <div className="grid gap-4 md:grid-cols-4">
        <label className="block space-y-1 text-sm font-medium">
          <span>Start time</span>
          <input
            name="startTime"
            type="time"
            required
            className="h-11 w-full rounded-md border border-input bg-background px-3"
          />
        </label>
        <label className="block space-y-1 text-sm font-medium">
          <span>Duration</span>
          <input
            name="duration"
            type="number"
            min="1"
            defaultValue="60"
            className="h-11 w-full rounded-md border border-input bg-background px-3"
          />
          <input type="hidden" name="endTime" value="11:00" />
        </label>
        <label className="block space-y-1 text-sm font-medium">
          <span>Start date</span>
          <input
            name="startDate"
            type="date"
            required
            className="h-11 w-full rounded-md border border-input bg-background px-3"
          />
        </label>
        <label className="block space-y-1 text-sm font-medium">
          <span>End date</span>
          <input
            name="endDate"
            type="date"
            required
            className="h-11 w-full rounded-md border border-input bg-background px-3"
          />
        </label>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <label className="block space-y-1 text-sm font-medium">
          <span>Teacher</span>
          <select
            name="teacherId"
            className="h-11 w-full rounded-md border border-input bg-background px-3"
          >
            <option value="">Use group teacher</option>
            {teachers.map((teacher) => (
              <option key={teacher.id} value={teacher.id}>
                {teacher.fullName ?? teacher.email}
              </option>
            ))}
          </select>
        </label>
        <label className="block space-y-1 text-sm font-medium">
          <span>Subject</span>
          <select
            name="subjectId"
            className="h-11 w-full rounded-md border border-input bg-background px-3"
          >
            <option value="">Use group subject</option>
            {subjects.map((subject) => (
              <option key={subject.id} value={subject.id}>
                {subject.name}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="grid gap-4 md:grid-cols-[1fr_1.5fr]">
        <label className="block space-y-1 text-sm font-medium">
          <span>Meeting provider</span>
          <select
            name="meetingProvider"
            defaultValue="GOOGLE_MEET"
            className="h-11 w-full rounded-md border border-input bg-background px-3"
          >
            <option value="GOOGLE_MEET">Google Meet</option>
            <option value="MANUAL">Manual</option>
          </select>
        </label>
        <label className="block space-y-1 text-sm font-medium">
          <span>Base live link / Live lesson URL</span>
          <input
            name="liveLessonUrl"
            required
            className="h-11 w-full rounded-md border border-input bg-background px-3"
          />
        </label>
      </div>
      <input type="hidden" name="timezone" value="Africa/Nairobi" />
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="secondary" onClick={() => setShowPreview(true)}>
          Preview
        </Button>
        <Button type="submit">Create Recurring Lessons</Button>
      </div>
      {previewLabel ? (
        <div className="rounded-md border border-secondary p-3 text-sm">
          <p>{previewLabel}</p>
          <p>4 lessons will be generated.</p>
        </div>
      ) : null}
    </form>
  );
}
