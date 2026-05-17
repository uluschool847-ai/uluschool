import { updateStudentLearningStatusAction } from "@/app/(admin)/admin/students/actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";

type StudentLearningStatus = "TRIAL" | "ACTIVE" | "PAUSED" | "INACTIVE";

type StudentStatusControlProps = {
  studentId: string;
  currentStatus: StudentLearningStatus;
  accountIsActive: boolean;
  flashMessage?: string;
  flashError?: string;
  successRedirect: string;
  errorRedirect: string;
};

const STATUS_OPTIONS: Array<{ value: StudentLearningStatus; label: string }> = [
  { value: "TRIAL", label: "Trial" },
  { value: "ACTIVE", label: "Active" },
  { value: "PAUSED", label: "Paused" },
  { value: "INACTIVE", label: "Inactive" },
];

function StatusFlash({ message, error }: { message?: string; error?: string }) {
  if (error) {
    return (
      <div
        className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
        role="alert"
      >
        {error}
      </div>
    );
  }

  if (message) {
    return (
      <output className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
        {message}
      </output>
    );
  }

  return null;
}

export function StudentStatusControl({
  studentId,
  currentStatus,
  accountIsActive,
  flashMessage,
  flashError,
  successRedirect,
  errorRedirect,
}: StudentStatusControlProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Learning Status</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <StatusFlash message={flashMessage} error={flashError} />

        <p className="text-sm text-slate-600">
          Account access: {accountIsActive ? "Active" : "Inactive"}
        </p>

        <form
          action={updateStudentLearningStatusAction as unknown as (formData: FormData) => void}
          className="space-y-4"
        >
          <input type="hidden" name="id" value={studentId} />
          <input type="hidden" name="flash" value="true" />
          <input type="hidden" name="successRedirect" value={successRedirect} />
          <input type="hidden" name="errorRedirect" value={errorRedirect} />

          <div className="space-y-2">
            <Label htmlFor="learningStatus">Learning status</Label>
            <select
              id="learningStatus"
              name="learningStatus"
              defaultValue={currentStatus}
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            >
              {STATUS_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <input
              aria-hidden="true"
              className="sr-only"
              readOnly
              tabIndex={-1}
              value={currentStatus}
            />
          </div>

          <p className="text-xs text-muted-foreground">
            Student role is fixed by the student admin flow and cannot be changed here.
          </p>

          <div className="flex justify-end">
            <Button type="submit">Update Status</Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
