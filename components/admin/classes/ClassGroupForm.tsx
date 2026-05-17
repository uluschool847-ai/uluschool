import { ClassGroupStatus } from "@prisma/client";

import {
  createClassGroupAction,
  updateClassGroupAction,
} from "@/app/(admin)/admin/classes/actions";
import { Button } from "@/components/ui/button";

type Option = {
  id: string;
  name?: string;
  fullName?: string;
  slug?: string;
  email?: string;
  isActive?: boolean;
};

type ClassGroupFormRecord = {
  id: string;
  name: string;
  description: string | null;
  subjectId: string | null;
  subject?: Option | null;
  levelId: string | null;
  level?: Option | null;
  teacherId: string | null;
  teacher?: Option | null;
  status: ClassGroupStatus | string;
  capacity: number | null;
  startDate: Date | string | null;
  endDate: Date | string | null;
};

type ClassGroupFormProps = {
  mode?: "create" | "edit";
  classGroup?: ClassGroupFormRecord | null;
  subjects: Option[];
  levels: Option[];
  teachers: Option[];
  currentSubject?: Option | null;
  currentLevel?: Option | null;
  currentTeacher?: Option | null;
  flashMessage?: string;
  flashError?: string;
};

function formatDateInput(value: Date | string | null | undefined) {
  if (!value) return "";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString().slice(0, 10);
}

function optionLabel(option: Option) {
  return option.fullName ?? option.name ?? option.email ?? option.slug ?? option.id;
}

function uniqueOptions(options: Option[], current?: Option | null) {
  const map = new Map<string, Option>();
  for (const option of options) {
    map.set(option.id, option);
  }
  if (current) {
    map.set(current.id, current);
  }
  return Array.from(map.values());
}

export function ClassGroupForm({
  mode,
  classGroup,
  subjects,
  levels,
  teachers,
  currentSubject,
  currentLevel,
  currentTeacher,
  flashMessage,
  flashError,
}: ClassGroupFormProps) {
  const isEditing = mode === "edit" || Boolean(classGroup?.id);
  const action = isEditing ? updateClassGroupAction : createClassGroupAction;
  const formAction = action as unknown as (formData: FormData) => void;
  const detailPath = classGroup?.id ? `/admin/classes/${classGroup.id}` : "/admin/classes";
  const selectedSubject = currentSubject ?? classGroup?.subject ?? null;
  const selectedLevel = currentLevel ?? classGroup?.level ?? null;
  const selectedTeacher = currentTeacher ?? classGroup?.teacher ?? null;

  return (
    <form action={formAction} className="space-y-5" data-testid="class-group-form">
      {classGroup?.id ? <input type="hidden" name="id" value={classGroup.id} /> : null}
      <input type="hidden" name="flash" value="true" />
      <input
        type="hidden"
        name="successRedirect"
        value={isEditing ? detailPath : "/admin/classes"}
      />
      <input
        type="hidden"
        name="errorRedirect"
        value={isEditing ? `/admin/classes/${classGroup?.id}/edit` : "/admin/classes/new"}
      />
      {isEditing ? (
        <>
          <input type="hidden" readOnly value={classGroup?.subjectId ?? ""} />
          <input type="hidden" readOnly value={classGroup?.levelId ?? ""} />
          <input type="hidden" readOnly value={classGroup?.teacherId ?? ""} />
          <input type="hidden" readOnly value={classGroup?.status ?? ""} />
        </>
      ) : null}

      {flashMessage ? (
        <p className="rounded-md border border-green-200 bg-green-50 p-2 text-sm text-green-700">
          {flashMessage}
        </p>
      ) : null}
      {flashError ? (
        <p
          role="alert"
          className="rounded-md border border-red-200 bg-red-50 p-2 text-sm text-red-700"
        >
          {flashError}
        </p>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2">
        <label className="space-y-1 text-sm font-medium">
          <span>Name</span>
          <input
            name="name"
            defaultValue={classGroup?.name ?? ""}
            required
            className="h-11 w-full rounded-md border border-input bg-background px-3"
          />
        </label>

        <label className="space-y-1 text-sm font-medium">
          <span>Status</span>
          <select
            name="status"
            defaultValue={classGroup?.status ?? ClassGroupStatus.ACTIVE}
            className="h-11 w-full rounded-md border border-input bg-background px-3"
          >
            <option value={ClassGroupStatus.ACTIVE}>Active</option>
            <option value={ClassGroupStatus.PAUSED}>Paused</option>
            <option value={ClassGroupStatus.ARCHIVED}>Archived</option>
          </select>
        </label>

        <label className="space-y-1 text-sm font-medium md:col-span-2">
          <span>Description</span>
          <textarea
            name="description"
            defaultValue={classGroup?.description ?? ""}
            rows={3}
            className="w-full rounded-md border border-input bg-background px-3 py-2"
          />
        </label>

        <label className="space-y-1 text-sm font-medium">
          <span>Subject</span>
          <select
            name="subjectId"
            defaultValue={classGroup?.subjectId ?? ""}
            className="h-11 w-full rounded-md border border-input bg-background px-3"
          >
            <option value="">No subject</option>
            {uniqueOptions(subjects, selectedSubject).map((subject) => (
              <option key={subject.id} value={subject.id}>
                {optionLabel(subject)}
                {subject.isActive === false ? " (inactive)" : ""}
              </option>
            ))}
          </select>
        </label>

        <label className="space-y-1 text-sm font-medium">
          <span>Level</span>
          <select
            name="levelId"
            defaultValue={classGroup?.levelId ?? ""}
            className="h-11 w-full rounded-md border border-input bg-background px-3"
          >
            <option value="">No level</option>
            {uniqueOptions(levels, selectedLevel).map((level) => (
              <option key={level.id} value={level.id}>
                {optionLabel(level)}
              </option>
            ))}
          </select>
        </label>

        <label className="space-y-1 text-sm font-medium">
          <span>Teacher</span>
          <select
            name="teacherId"
            defaultValue={classGroup?.teacherId ?? ""}
            className="h-11 w-full rounded-md border border-input bg-background px-3"
          >
            <option value="">No teacher</option>
            {uniqueOptions(teachers, selectedTeacher).map((teacher) => (
              <option key={teacher.id} value={teacher.id}>
                {optionLabel(teacher)}
                {teacher.isActive === false ? " (inactive)" : ""}
              </option>
            ))}
          </select>
        </label>

        <label className="space-y-1 text-sm font-medium">
          <span>Capacity</span>
          <input
            name="capacity"
            type="number"
            min="0"
            defaultValue={classGroup?.capacity ?? ""}
            className="h-11 w-full rounded-md border border-input bg-background px-3"
          />
        </label>

        <label className="space-y-1 text-sm font-medium">
          <span>Start date</span>
          <input
            name="startDate"
            type="date"
            defaultValue={formatDateInput(classGroup?.startDate)}
            className="h-11 w-full rounded-md border border-input bg-background px-3"
          />
        </label>

        <label className="space-y-1 text-sm font-medium">
          <span>End date</span>
          <input
            name="endDate"
            type="date"
            defaultValue={formatDateInput(classGroup?.endDate)}
            className="h-11 w-full rounded-md border border-input bg-background px-3"
          />
        </label>
      </div>

      <div className="flex gap-3">
        <Button type="submit">{isEditing ? "Save Class Group" : "Create Class Group"}</Button>
        <Button asChild type="button" variant="secondary">
          <a href={detailPath}>Cancel</a>
        </Button>
      </div>
    </form>
  );
}
