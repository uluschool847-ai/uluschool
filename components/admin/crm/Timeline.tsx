import { ClipboardCheck, MessageSquareText, UserRoundCheck } from "lucide-react";

type TimelineEvent = {
  id: string;
  type: "STATUS_CHANGED" | "NOTE_CREATED" | "ASSIGNED" | string;
  message: string;
  actorId?: string;
  createdAt: string | Date;
};

function eventMeta(type: string) {
  if (type === "STATUS_CHANGED" || type === "STATUS_CHANGE") {
    return {
      label: "Status change",
      icon: <ClipboardCheck className="h-4 w-4" aria-hidden="true" />,
    };
  }

  if (type === "NOTE_CREATED" || type === "NOTE_ADDED") {
    return {
      label: "Note",
      icon: <MessageSquareText className="h-4 w-4" aria-hidden="true" />,
    };
  }

  return {
    label: "Assignment",
    icon: <UserRoundCheck className="h-4 w-4" aria-hidden="true" />,
  };
}

export function Timeline({ events }: { events: TimelineEvent[] }) {
  if (events.length === 0) {
    return (
      <div className="rounded-md border border-slate-200 bg-white p-4 text-sm text-slate-600">
        No timeline events yet.
      </div>
    );
  }

  return (
    <ol className="space-y-3" aria-label="CRM timeline">
      {events.map((event) => {
        const meta = eventMeta(event.type);
        return (
          <li key={event.id} className="flex gap-3 rounded-md border border-slate-200 bg-white p-4">
            <span
              aria-label={meta.label}
              className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-700"
            >
              {meta.icon}
            </span>
            <div className="min-w-0">
              <div className="text-xs font-semibold uppercase text-slate-500">{meta.label}</div>
              <p className="mt-1 text-sm font-medium text-slate-900">{event.message}</p>
              <time
                className="mt-1 block text-xs text-slate-500"
                dateTime={new Date(event.createdAt).toISOString()}
              >
                {new Date(event.createdAt).toLocaleString()}
              </time>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
