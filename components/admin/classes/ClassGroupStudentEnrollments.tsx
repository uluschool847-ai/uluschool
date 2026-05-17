import {
  enrollStudentToClassGroupAction,
  unenrollStudentFromClassGroupAction,
} from "@/app/(admin)/admin/classes/actions";
import { Button } from "@/components/ui/button";

type Student = {
  id: string;
  fullName: string;
  email: string;
  isActive?: boolean;
};

type ClassGroupStudentEnrollmentsProps = {
  classGroupId: string;
  currentStudents: Student[];
  availableStudents: Student[];
  flashMessage?: string | null;
  flashError?: string | null;
};

export function ClassGroupStudentEnrollments({
  classGroupId,
  currentStudents,
  availableStudents,
  flashMessage,
  flashError,
}: ClassGroupStudentEnrollmentsProps) {
  return (
    <section className="space-y-4" aria-label="Student enrollments">
      <div>
        <h2 className="text-xl font-semibold">Enrolled Students</h2>
        {flashMessage ? (
          <p className="mt-2 rounded-md border border-green-200 bg-green-50 p-2 text-sm text-green-700">
            {flashMessage}
          </p>
        ) : null}
        {flashError ? (
          <p
            role="alert"
            className="mt-2 rounded-md border border-red-200 bg-red-50 p-2 text-sm text-red-700"
          >
            {flashError}
          </p>
        ) : null}
      </div>

      {currentStudents.length === 0 ? (
        <p className="text-sm text-muted-foreground">No learners assigned yet.</p>
      ) : (
        <ul className="divide-y rounded-md border">
          {currentStudents.map((student) => (
            <li key={student.id} className="flex items-center justify-between gap-3 p-3">
              <div>
                <p className="font-medium">{student.fullName}</p>
                <p className="text-sm text-muted-foreground">{student.email}</p>
              </div>
              <form
                action={
                  unenrollStudentFromClassGroupAction as unknown as (formData: FormData) => void
                }
              >
                <input type="hidden" name="flash" value="true" />
                <input type="hidden" name="classGroupId" value={classGroupId} />
                <input type="hidden" name="studentId" value={student.id} />
                <input
                  type="hidden"
                  name="successRedirect"
                  value={`/admin/classes/${classGroupId}`}
                />
                <input
                  type="hidden"
                  name="errorRedirect"
                  value={`/admin/classes/${classGroupId}`}
                />
                <Button type="submit" variant="secondary" size="sm">
                  Remove
                </Button>
              </form>
            </li>
          ))}
        </ul>
      )}

      {availableStudents.length > 0 ? (
        <div className="space-y-2">
          <p className="text-sm font-medium">Enrollment Options</p>
          <ul className="flex flex-wrap gap-2">
            {availableStudents.map((student) => (
              <li key={student.id} className="rounded-md border px-2 py-1 text-sm">
                {student.fullName}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <form
        action={enrollStudentToClassGroupAction as unknown as (formData: FormData) => void}
        className="flex flex-wrap items-end gap-3"
      >
        <input type="hidden" name="flash" value="true" />
        <input type="hidden" name="classGroupId" value={classGroupId} />
        <input type="hidden" name="successRedirect" value={`/admin/classes/${classGroupId}`} />
        <input type="hidden" name="errorRedirect" value={`/admin/classes/${classGroupId}`} />
        <label className="min-w-64 flex-1 space-y-1 text-sm font-medium">
          <span>Student</span>
          <select
            name="studentId"
            className="h-11 w-full rounded-md border border-input bg-background px-3"
          >
            <option value="">Select student</option>
            {availableStudents.map((student) => (
              <option key={student.id} value={student.id} label={student.fullName}>
                {student.email}
              </option>
            ))}
          </select>
        </label>
        <Button type="submit">Add Student</Button>
      </form>
    </section>
  );
}
