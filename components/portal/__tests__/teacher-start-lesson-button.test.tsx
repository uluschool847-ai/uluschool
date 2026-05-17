import { readFileSync } from "node:fs";
import { cleanup, render, screen } from "@testing-library/react";
import type { ComponentType } from "react";
import { afterEach, describe, expect, it } from "vitest";

type StartLessonState = {
  enabled: boolean;
  href: string | null;
  reason: string | null;
};

type TeacherStartLessonButtonProps = {
  startState: StartLessonState;
  provider: "GOOGLE_MEET" | "MANUAL_URL";
};

type TeacherStartLessonButtonModule = {
  default?: ComponentType<TeacherStartLessonButtonProps>;
  TeacherStartLessonButton?: ComponentType<TeacherStartLessonButtonProps>;
};

async function loadTeacherStartLessonButton() {
  const specifier = "@/components/portal/teacher-start-lesson-button";
  const mod = (await import(/* @vite-ignore */ specifier)) as TeacherStartLessonButtonModule;
  const Component = mod.TeacherStartLessonButton ?? mod.default;

  if (!Component) {
    throw new Error("TeacherStartLessonButton export is missing");
  }

  return Component;
}

function enabledState(href = "https://meet.google.com/abc-defg-hij"): StartLessonState {
  return { enabled: true, href, reason: null };
}

function disabledState(reason = "Meeting link missing"): StartLessonState {
  return { enabled: false, href: null, reason };
}

describe("TeacherStartLessonButton", () => {
  afterEach(() => {
    cleanup();
  });

  it("renders an enabled Start Lesson link with safe external attributes", async () => {
    const TeacherStartLessonButton = await loadTeacherStartLessonButton();

    render(<TeacherStartLessonButton provider="GOOGLE_MEET" startState={enabledState()} />);

    const link = screen.getByRole("link", { name: "Start Lesson" });
    expect(link).toHaveAttribute("href", "https://meet.google.com/abc-defg-hij");
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noreferrer");
  });

  it("renders a disabled Start Lesson button with the disabled reason", async () => {
    const TeacherStartLessonButton = await loadTeacherStartLessonButton();

    render(
      <TeacherStartLessonButton
        provider="GOOGLE_MEET"
        startState={disabledState("Available before lesson")}
      />,
    );

    expect(screen.getByRole<HTMLButtonElement>("button", { name: "Start Lesson" }).disabled).toBe(
      true,
    );
    expect(screen.getByText("Available before lesson")).toBeDefined();
  });

  it("does not render raw meeting URLs as ordinary visible text", async () => {
    const TeacherStartLessonButton = await loadTeacherStartLessonButton();

    const { container } = render(
      <TeacherStartLessonButton
        provider="MANUAL_URL"
        startState={enabledState("https://example.com/live/classroom")}
      />,
    );

    expect(container.textContent ?? "").toBe("Start Lesson");
    expect(screen.getByRole("link", { name: "Start Lesson" })).toHaveAttribute(
      "href",
      "https://example.com/live/classroom",
    );
  });

  it.each([
    "javascript:alert(1)",
    "data:text/html,<script>alert(1)</script>",
    "file:///tmp/lesson.html",
    "http://meet.google.com/abc-defg-hij",
    "https://example.com/not-google-meet",
  ])("never renders unsafe or provider-mismatched href %s as an active link", async (href) => {
    const TeacherStartLessonButton = await loadTeacherStartLessonButton();

    const { container } = render(
      <TeacherStartLessonButton
        provider="GOOGLE_MEET"
        startState={{ enabled: true, href, reason: null }}
      />,
    );

    expect(screen.queryByRole("link", { name: "Start Lesson" })).toBeNull();
    expect(screen.getByRole<HTMLButtonElement>("button", { name: "Start Lesson" }).disabled).toBe(
      true,
    );
    expect(container.querySelector("a")).toBeNull();
    expect(container.textContent ?? "").not.toContain(href);
  });
});

describe("teacher Start Lesson source consistency", () => {
  it("keeps teacher pages on the shared start button instead of local Start Lesson renderers", () => {
    const dashboardSource = readFileSync("app/portal/teacher/page.tsx", "utf8");
    const scheduleSource = readFileSync("components/portal/teacher-schedule-display.tsx", "utf8");
    const workspaceSource = readFileSync("app/portal/teacher/lessons/[lessonId]/page.tsx", "utf8");

    for (const source of [dashboardSource, scheduleSource, workspaceSource]) {
      expect(source).toContain("TeacherStartLessonButton");
      expect(source).not.toMatch(/function\s+StartLessonControl/);
      expect(source).not.toMatch(/<a\s+href=\{[^}]*liveLessonUrl[^}]*\}/);
    }
  });

  it("does not hardcode MANUAL_URL in teacher Start Lesson validation paths", () => {
    const files = [
      "app/portal/teacher/page.tsx",
      "components/portal/teacher-schedule-display.tsx",
      "app/portal/teacher/lessons/[lessonId]/page.tsx",
      "lib/repositories/teacher-schedule-repository.ts",
      "lib/repositories/teacher-lesson-workspace-repository.ts",
    ];

    for (const file of files) {
      const source = readFileSync(file, "utf8");
      expect(source, file).not.toMatch(/canStartLesson\s*\(\s*status/);
      expect(source, file).not.toMatch(/validateLiveLessonUrl\([^)]*"MANUAL_URL"/);
      expect(source, file).not.toMatch(/meetingProvider\s*\?\?\s*["']MANUAL_URL["']/);
    }
  });
});
