// tests/repositories/educational-model.test.ts
import { describe, expect, it } from "vitest";

interface User {
  id: string;
  role: "PARENT" | "STUDENT" | "TEACHER";
  name: string;
}

interface Class {
  id: string;
  name: string;
  teacherId: string;
}

interface Assignment {
  id: string;
  classId: string;
  title: string;
}

interface Submission {
  id: string;
  assignmentId: string;
  studentId: string;
  grade?: number;
}

interface StudentProfile {
  student: User;
  enrolledClasses: Class[];
  recentSubmissions: (Submission & { assignment: Assignment })[];
}

import * as assignmentRepository from "@/lib/repositories/assignment-repository";
import * as classRepository from "@/lib/repositories/class-repository";
import * as userRepository from "@/lib/repositories/user-repository";

const REPOSITORY_INTEGRATION_TIMEOUT_MS = 15_000;

describe("Educational Data Model Integration Tests", () => {
  describe("Parent-Child Relationship", () => {
    it(
      "should retrieve multiple student children linked to a parent user",
      async () => {
        const parentId = "parent-123";

        const children = await userRepository.getChildren(parentId);

        expect(Array.isArray(children)).toBe(true);
        for (const child of children) {
          expect(child).toHaveProperty("id");
          expect(child.role).toBe("STUDENT");
        }
      },
      REPOSITORY_INTEGRATION_TIMEOUT_MS,
    );
  });

  describe("Class & Roster Management", () => {
    it("should verify that a class belongs to exactly one teacher", async () => {
      const classId = "class-456";

      const classData = await classRepository.findById(classId);

      expect(classData).toBeDefined();
      expect(classData).toHaveProperty("teacherId");
      expect(typeof classData.teacherId).toBe("string");
    });

    it("should retrieve a list of student enrollments for a specific class", async () => {
      const classId = "class-456";

      const roster = await classRepository.getRoster(classId);

      expect(Array.isArray(roster)).toBe(true);
      for (const student of roster) {
        expect(student.role).toBe("STUDENT");
      }
    });
  });

  describe("Assignments & Submissions", () => {
    it("should link an assignment to a class", async () => {
      const assignmentId = "assignment-789";

      const assignmentData = await assignmentRepository.findById(assignmentId);

      expect(assignmentData).toBeDefined();
      expect(assignmentData).toHaveProperty("scheduledClassId");
      expect(typeof assignmentData?.scheduledClassId).toBe("string");
    });

    it("should link a submission strongly to both an assignment and a specific student", async () => {
      const assignmentId = "assignment-789";
      const studentId = "student-101";

      const studentSubmissions = await assignmentRepository.getSubmissionsForStudent(
        assignmentId,
        studentId,
      );

      expect(Array.isArray(studentSubmissions)).toBe(true);
      for (const submission of studentSubmissions) {
        expect(submission.assignmentId).toBe(assignmentId);
        expect(submission.studentId).toBe(studentId);
      }
    });
  });

  describe("Academic Progression", () => {
    it("should fetch a student profile returning their enrolled classes and recent submissions", async () => {
      const studentId = "student-101";

      const profile = await userRepository.getStudentProfile(studentId);

      expect(profile).toBeDefined();
      expect(profile.student).toBeDefined();
      expect(profile.student.id).toBe(studentId);

      expect(Array.isArray(profile.enrolledClasses)).toBe(true);
      expect(Array.isArray(profile.recentSubmissions)).toBe(true);

      for (const submission of profile.recentSubmissions) {
        expect(submission).toHaveProperty("assignment");
        expect(submission.assignment).toHaveProperty("title");
      }
    });
  });
});
