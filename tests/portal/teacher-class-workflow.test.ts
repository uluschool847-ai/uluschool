import { prisma } from "@/lib/prisma";
import { describe, expect, it } from "vitest";

import * as scheduleRepository from "@/lib/repositories/schedule-repository";

interface ExpectedStudent {
  id: string;
  fullName: string;
}

interface ExpectedAssignment {
  id: string;
  title: string;
}

interface ExpectedClassDetails {
  id: string;
  title: string;
  startAt: Date;
  endAt: Date;
  students: ExpectedStudent[];
  assignments: ExpectedAssignment[];
}

describe("Teacher Class Workflow & Security", () => {
  describe("Data Hydration (getTeacherClassDetails)", () => {
    it("should return a fully hydrated class object with roster, schedule details, and assignments", async () => {
      // Find a complex seeded class with students and assignments
      const seededClass = await prisma.scheduledClass.findFirst({
        where: {
          teacherId: { not: null },
          students: { some: {} },
          assignments: { some: {} },
        },
        include: { students: true, assignments: true },
      });

      expect(seededClass).toBeDefined();
      if (!seededClass || !seededClass.teacherId) return;

      const classDetails = await scheduleRepository.getTeacherClassDetails(
        seededClass.teacherId,
        seededClass.id,
      );

      expect(classDetails).toBeDefined();
      expect(classDetails).not.toBeNull();

      // Basic Details Check
      expect(classDetails.id).toBe(seededClass.id);
      expect(classDetails.title).toBe(seededClass.title);
      expect(classDetails.startAt).toBeInstanceOf(Date);
      expect(classDetails.endAt).toBeInstanceOf(Date);

      // Hydration Check: Roster
      expect(Array.isArray(classDetails.students)).toBe(true);
      expect(classDetails.students.length).toBe(seededClass.students.length);
      expect(classDetails.students[0]).toHaveProperty("fullName");

      // Hydration Check: Assignments
      expect(Array.isArray(classDetails.assignments)).toBe(true);
      expect(classDetails.assignments.length).toBe(seededClass.assignments.length);
      expect(classDetails.assignments[0]).toHaveProperty("title");
    }, 15000);
  });

  describe("Strict Security (IDOR Prevention)", () => {
    it("should throw an error or return null if a teacher requests a class they do not own", async () => {
      // Find a class owned by a teacher
      const seededClass = await prisma.scheduledClass.findFirst({
        where: { teacherId: { not: null } },
      });

      // Find a completely different teacher
      const otherTeacher = await prisma.appUser.findFirst({
        where: {
          role: "TEACHER",
          id: { not: seededClass?.teacherId || "" },
        },
      });

      expect(seededClass).toBeDefined();
      expect(otherTeacher).toBeDefined();
      if (!seededClass || !otherTeacher) return;

      try {
        const result = await scheduleRepository.getTeacherClassDetails(
          otherTeacher.id,
          seededClass.id,
        );

        // If the method doesn't throw, it MUST explicitly return null to prevent IDOR
        expect(result).toBeNull();
      } catch (error: unknown) {
        // If it throws, it must be an intentional authorization or missing/forbidden error
        const message = error instanceof Error ? error.message : String(error);
        expect(message).toMatch(/Forbidden|Unauthorized|Access Denied|Not Found|does not exist/i);
      }
    });
  });

  describe("Empty States", () => {
    it("should return empty arrays for students and assignments instead of failing when the class is empty", async () => {
      // Find a class with 0 students and 0 assignments (seeded in empty state scenarios)
      const emptyClass = await prisma.scheduledClass.findFirst({
        where: {
          teacherId: { not: null },
          students: { none: {} },
          assignments: { none: {} },
        },
      });

      expect(emptyClass).toBeDefined();
      if (!emptyClass || !emptyClass.teacherId) return;

      const classDetails = await scheduleRepository.getTeacherClassDetails(
        emptyClass.teacherId,
        emptyClass.id,
      );

      expect(classDetails).toBeDefined();
      expect(classDetails).not.toBeNull();

      // Should handle empty arrays gracefully
      expect(Array.isArray(classDetails.students)).toBe(true);
      expect(classDetails.students.length).toBe(0);

      expect(Array.isArray(classDetails.assignments)).toBe(true);
      expect(classDetails.assignments.length).toBe(0);
    });
  });
});
