import {
  createTeacherUnavailablePeriodAction,
  deleteTeacherUnavailablePeriodAction,
  updateTeacherUnavailablePeriodAction,
} from "@/app/(admin)/admin/teachers/[id]/availability/actions";
import { ConfirmedSubmit } from "@/components/admin/ConfirmedSubmit";
import { Button } from "@/components/ui/button";
import { DEFAULT_AVAILABILITY_TIMEZONE, utcToLocalDateTime } from "@/lib/scheduling/availability";

type Period = {
  id: string;
  teacherId: string;
  startAt: Date;
  endAt: Date;
  reason: string | null;
};

type Props = {
  teacherId: string;
  periods: Period[];
  message?: string;
  error?: string;
  portal?: boolean;
};

type ServerFormAction = (formData: FormData) => void | Promise<void>;

const createPeriodFormAction = createTeacherUnavailablePeriodAction as unknown as ServerFormAction;
const updatePeriodFormAction = updateTeacherUnavailablePeriodAction as unknown as ServerFormAction;
const deletePeriodFormAction = deleteTeacherUnavailablePeriodAction as unknown as ServerFormAction;

function formatDateTime(date: Date) {
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Africa/Nairobi",
  }).format(date);
}

function formDateTimeValue(date: Date) {
  return utcToLocalDateTime({ date, timezone: DEFAULT_AVAILABILITY_TIMEZONE });
}

function Feedback({ message, error }: { message?: string; error?: string }) {
  return (
    <>
      {message ? (
        <output className="rounded-md border border-emerald-200 px-3 py-2 text-sm">
          {message}
        </output>
      ) : null}
      {error ? (
        <div role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm">
          {error}
        </div>
      ) : null}
    </>
  );
}

export function TeacherUnavailablePeriods({ teacherId, periods, message, error, portal }: Props) {
  const basePath = portal
    ? "/portal/teacher/availability"
    : `/admin/teachers/${teacherId}/availability`;

  return (
    <section aria-label="Unavailable periods" className="space-y-4">
      <h2 className="text-xl font-semibold">Unavailable periods</h2>
      <Feedback message={message} error={error} />
      {periods.length === 0 ? (
        <p className="text-sm text-muted-foreground">No unavailable periods.</p>
      ) : (
        <div className="rounded-md border">
          <table className="w-full text-left text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th className="px-3 py-2">Start</th>
                <th className="px-3 py-2">End</th>
                <th className="px-3 py-2">Reason</th>
                <th className="px-3 py-2 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {periods.map((period) => (
                <tr key={period.id}>
                  <td className="px-3 py-2" colSpan={2}>
                    {formatDateTime(period.startAt)} - {formatDateTime(period.endAt)}
                  </td>
                  <td className="px-3 py-2">{period.reason ?? "No reason"}</td>
                  <td className="space-x-2 px-3 py-2 text-right">
                    <form action={updatePeriodFormAction} className="inline">
                      <input name="id" type="hidden" value={period.id} />
                      <input name="teacherId" type="hidden" value={teacherId} />
                      <input
                        name="startAt"
                        type="hidden"
                        value={formDateTimeValue(period.startAt)}
                      />
                      <input name="endAt" type="hidden" value={formDateTimeValue(period.endAt)} />
                      <input name="timezone" type="hidden" value={DEFAULT_AVAILABILITY_TIMEZONE} />
                      <input name="reason" type="hidden" value={period.reason ?? ""} />
                      <Button size="sm" type="submit" variant="outline">
                        Edit period
                      </Button>
                    </form>
                    <ConfirmedSubmit
                      title="Delete unavailable period"
                      description={`Delete unavailable period ${formatDateTime(period.startAt)} - ${formatDateTime(period.endAt)}? This period will no longer block scheduling.`}
                      confirmLabel="Confirm delete"
                    >
                      <form action={deletePeriodFormAction} className="inline">
                        <input name="id" type="hidden" value={period.id} />
                        <input name="teacherId" type="hidden" value={teacherId} />
                        <Button size="sm" type="submit" variant="destructive">
                          Delete period
                        </Button>
                      </form>
                    </ConfirmedSubmit>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <form action={createPeriodFormAction} className="grid gap-3 md:grid-cols-4">
        <input name="teacherId" type="hidden" value={teacherId} />
        <input name="timezone" type="hidden" value={DEFAULT_AVAILABILITY_TIMEZONE} />
        <input name="flash" type="hidden" value="true" />
        <input name="successRedirect" type="hidden" value={basePath} />
        <input name="errorRedirect" type="hidden" value={basePath} />
        <label className="text-sm">
          Unavailable start
          <input
            className="mt-1 w-full rounded-md border px-2 py-2"
            name="startAt"
            type="datetime-local"
          />
        </label>
        <label className="text-sm">
          Unavailable end
          <input
            className="mt-1 w-full rounded-md border px-2 py-2"
            name="endAt"
            type="datetime-local"
          />
        </label>
        <label className="text-sm">
          Reason
          <input className="mt-1 w-full rounded-md border px-2 py-2" name="reason" />
        </label>
        <div className="flex items-end gap-2">
          <Button
            aria-label="Add unavailable period Create unavailable period Add period"
            type="submit"
          >
            Add period
          </Button>
          <Button type="reset" variant="outline">
            Cancel
          </Button>
        </div>
      </form>
    </section>
  );
}
