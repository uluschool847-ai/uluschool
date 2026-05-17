import { cleanup, render, screen, within } from "@testing-library/react";
import type React from "react";
import { afterEach, describe, expect, it } from "vitest";

type TimelineEvent = {
  id: string;
  type: "STATUS_CHANGED" | "NOTE_CREATED" | "ASSIGNED";
  message: string;
  actorId: string;
  createdAt: string;
};

async function loadTimeline() {
  const specifier = "@/components/admin/crm/Timeline";
  return import(/* @vite-ignore */ specifier) as Promise<{
    Timeline: React.ComponentType<{ events: TimelineEvent[] }>;
  }>;
}

describe("Admin CRM Timeline", () => {
  afterEach(() => {
    cleanup();
  });

  it("renders timeline events in repository order", () => {
    return loadTimeline().then(({ Timeline }) => {
      render(
        <Timeline
          events={[
            {
              id: "event-1",
              type: "STATUS_CHANGED",
              message: "Status changed to IN_PROGRESS",
              actorId: "admin-1",
              createdAt: "2026-05-01T08:00:00.000Z",
            },
            {
              id: "event-2",
              type: "NOTE_CREATED",
              message: "Note added: Parent prefers Saturday lessons.",
              actorId: "admin-2",
              createdAt: "2026-05-01T08:05:00.000Z",
            },
            {
              id: "event-3",
              type: "ASSIGNED",
              message: "Assigned to admissions manager",
              actorId: "admin-1",
              createdAt: "2026-05-01T08:10:00.000Z",
            },
          ]}
        />,
      );

      const items = screen.getAllByRole("listitem");

      expect(within(items[0]).getByText(/status changed to in_progress/i)).toBeDefined();
      expect(within(items[1]).getByText(/parent prefers saturday lessons/i)).toBeDefined();
      expect(within(items[2]).getByText(/assigned to admissions manager/i)).toBeDefined();
    });
  });

  it("shows distinct labels or icons for status, note, and assignment event types", () => {
    return loadTimeline().then(({ Timeline }) => {
      render(
        <Timeline
          events={[
            {
              id: "status",
              type: "STATUS_CHANGED",
              message: "Status changed",
              actorId: "admin-1",
              createdAt: "2026-05-01T08:00:00.000Z",
            },
            {
              id: "note",
              type: "NOTE_CREATED",
              message: "Note added",
              actorId: "admin-1",
              createdAt: "2026-05-01T08:01:00.000Z",
            },
            {
              id: "assignment",
              type: "ASSIGNED",
              message: "Assigned to manager",
              actorId: "admin-1",
              createdAt: "2026-05-01T08:02:00.000Z",
            },
          ]}
        />,
      );

      expect(screen.getByLabelText(/status change/i)).toBeDefined();
      expect(screen.getByLabelText(/note/i)).toBeDefined();
      expect(screen.getByLabelText(/assignment/i)).toBeDefined();
    });
  });

  it("renders a useful empty state when no events exist", () => {
    return loadTimeline().then(({ Timeline }) => {
      render(<Timeline events={[]} />);

      expect(screen.getByText(/no timeline events|no activity yet/i)).toBeDefined();
    });
  });
});
