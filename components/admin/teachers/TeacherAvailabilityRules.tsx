import type { AvailabilitySlotStatus } from "@prisma/client";

import {
  createTeacherAvailabilityRuleAction,
  deleteTeacherAvailabilityRuleAction,
  toggleTeacherAvailabilityRuleStatusAction,
  updateTeacherAvailabilityRuleAction,
} from "@/app/(admin)/admin/teachers/[id]/availability/actions";
import { ConfirmedSubmit } from "@/components/admin/ConfirmedSubmit";
import { Button } from "@/components/ui/button";

type Rule = {
  id: string;
  teacherId: string;
  weekday: number;
  startTime: string;
  endTime: string;
  timezone: string;
  status: AvailabilitySlotStatus | "ACTIVE" | "INACTIVE";
};

type Props = {
  teacherId: string;
  rules: Rule[];
  message?: string;
  error?: string;
  readOnly?: boolean;
};

type ServerFormAction = (formData: FormData) => void | Promise<void>;

const createRuleFormAction = createTeacherAvailabilityRuleAction as unknown as ServerFormAction;
const updateRuleFormAction = updateTeacherAvailabilityRuleAction as unknown as ServerFormAction;
const toggleRuleFormAction =
  toggleTeacherAvailabilityRuleStatusAction as unknown as ServerFormAction;
const deleteRuleFormAction = deleteTeacherAvailabilityRuleAction as unknown as ServerFormAction;

const WEEKDAYS = [
  [1, "Monday"],
  [2, "Tuesday"],
  [3, "Wednesday"],
  [4, "Thursday"],
  [5, "Friday"],
  [6, "Saturday"],
  [7, "Sunday"],
] as const;

function weekdayName(weekday: number) {
  return WEEKDAYS.find(([value]) => value === weekday)?.[1] ?? `Weekday ${weekday}`;
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

export function TeacherAvailabilityRules({ teacherId, rules, message, error, readOnly }: Props) {
  return (
    <section aria-label="Weekly availability" className="space-y-4">
      <div>
        <h2 className="text-xl font-semibold">Weekly availability</h2>
        {readOnly ? (
          <p className="text-sm text-muted-foreground">Admin-managed weekly availability.</p>
        ) : null}
      </div>
      <Feedback message={message} error={error} />
      {rules.length === 0 ? (
        <p className="text-sm text-muted-foreground">No weekly availability rules.</p>
      ) : (
        <div className="rounded-md border">
          <table className="w-full text-left text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th className="px-3 py-2">Weekday</th>
                <th className="px-3 py-2">Start</th>
                <th className="px-3 py-2">End</th>
                <th className="px-3 py-2">Timezone</th>
                <th className="px-3 py-2">Status</th>
                {!readOnly ? <th className="px-3 py-2 text-right">Actions</th> : null}
              </tr>
            </thead>
            <tbody className="divide-y">
              {rules.map((rule) => (
                <tr key={rule.id}>
                  <td className="px-3 py-2">{weekdayName(rule.weekday)}</td>
                  <td className="px-3 py-2">{rule.startTime}</td>
                  <td className="px-3 py-2">{rule.endTime}</td>
                  <td className="px-3 py-2">{rule.timezone}</td>
                  <td className="px-3 py-2">{rule.status === "ACTIVE" ? "Active" : "Inactive"}</td>
                  {!readOnly ? (
                    <td className="space-x-2 px-3 py-2 text-right">
                      <form action={updateRuleFormAction} className="inline">
                        <input name="id" type="hidden" value={rule.id} />
                        <input name="teacherId" type="hidden" value={teacherId} />
                        <input name="weekday" type="hidden" value={rule.weekday} />
                        <input name="startTime" type="hidden" value={rule.startTime} />
                        <input name="endTime" type="hidden" value={rule.endTime} />
                        <input name="timezone" type="hidden" value={rule.timezone} />
                        <Button size="sm" type="submit" variant="outline">
                          Edit rule
                        </Button>
                      </form>
                      {rule.status === "ACTIVE" ? (
                        <ConfirmedSubmit
                          title="Deactivate availability rule"
                          description={`Deactivate ${weekdayName(rule.weekday)} ${rule.startTime}-${rule.endTime} availability in ${rule.timezone}? This slot will no longer be offered for scheduling.`}
                          confirmLabel="Confirm deactivation"
                        >
                          <form action={toggleRuleFormAction} className="inline">
                            <input name="id" type="hidden" value={rule.id} />
                            <input name="teacherId" type="hidden" value={teacherId} />
                            <input name="weekday" type="hidden" value={rule.weekday} />
                            <input name="timezone" type="hidden" value={rule.timezone} />
                            <input name="status" type="hidden" value="INACTIVE" />
                            <Button size="sm" type="submit" variant="outline">
                              Deactivate
                            </Button>
                          </form>
                        </ConfirmedSubmit>
                      ) : (
                        <form action={toggleRuleFormAction} className="inline">
                          <input name="id" type="hidden" value={rule.id} />
                          <input name="teacherId" type="hidden" value={teacherId} />
                          <input name="weekday" type="hidden" value={rule.weekday} />
                          <input name="timezone" type="hidden" value={rule.timezone} />
                          <input name="status" type="hidden" value="ACTIVE" />
                          <Button size="sm" type="submit" variant="outline">
                            Activate
                          </Button>
                        </form>
                      )}
                      <ConfirmedSubmit
                        title="Delete availability rule"
                        description={`Delete ${weekdayName(rule.weekday)} ${rule.startTime}-${rule.endTime} availability in ${rule.timezone}? This removes the weekly rule.`}
                        confirmLabel="Confirm delete"
                      >
                        <form action={deleteRuleFormAction} className="inline">
                          <input name="id" type="hidden" value={rule.id} />
                          <input name="teacherId" type="hidden" value={teacherId} />
                          <input name="weekday" type="hidden" value={rule.weekday} />
                          <input name="startTime" type="hidden" value={rule.startTime} />
                          <input name="endTime" type="hidden" value={rule.endTime} />
                          <input name="timezone" type="hidden" value={rule.timezone} />
                          <Button size="sm" type="submit" variant="destructive">
                            Delete rule
                          </Button>
                        </form>
                      </ConfirmedSubmit>
                    </td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {!readOnly ? (
        <form action={createRuleFormAction} className="grid gap-3 md:grid-cols-5">
          <input name="teacherId" type="hidden" value={teacherId} />
          <input name="flash" type="hidden" value="true" />
          <input
            name="successRedirect"
            type="hidden"
            value={`/admin/teachers/${teacherId}/availability`}
          />
          <input
            name="errorRedirect"
            type="hidden"
            value={`/admin/teachers/${teacherId}/availability`}
          />
          <label className="text-sm">
            Weekday
            <select className="mt-1 w-full rounded-md border px-2 py-2" name="weekday">
              {WEEKDAYS.map(([value]) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm">
            Start time
            <input
              className="mt-1 w-full rounded-md border px-2 py-2"
              name="startTime"
              type="time"
            />
          </label>
          <label className="text-sm">
            End time
            <input className="mt-1 w-full rounded-md border px-2 py-2" name="endTime" type="time" />
          </label>
          <label className="text-sm">
            Timezone
            <input
              className="mt-1 w-full rounded-md border px-2 py-2"
              defaultValue="Africa/Nairobi"
              name="timezone"
            />
          </label>
          <div className="flex items-end">
            <Button aria-label="Create rule Add rule" type="submit">
              Add rule
            </Button>
          </div>
        </form>
      ) : null}
    </section>
  );
}
