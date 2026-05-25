import {
  createLog,
  getLogs,
  listRecentAdminAuditLogs,
} from "@/lib/repositories/admin-audit-repository";
import { getRevenueMetrics } from "@/lib/repositories/analytics-repository";
import {
  findById as findAssignmentById,
  getSubmissionsForStudent,
} from "@/lib/repositories/assignment-repository";
import {
  getTeacherLessonAttendanceRoster,
  listAttendanceHistoryForClassGroup,
  listAttendanceHistoryForStudent,
  listParentChildAttendance,
  listStudentAttendance,
  markLessonAttendanceForTeacher,
} from "@/lib/repositories/attendance-repository";
import {
  completeManagerTask,
  createManagerTask,
  listPendingManagerTasks,
} from "@/lib/repositories/automation-repository";
import { getSubjects } from "@/lib/repositories/catalogue-repository";
import { findById as findClassById, getRoster } from "@/lib/repositories/class-repository";
import { getPageBySlug } from "@/lib/repositories/cms-repository";
import {
  findAllContactLeads,
  getContactLeadTimeline,
  listContactLeads,
} from "@/lib/repositories/contact-lead-repository";
import {
  assertTeacherOwnsMaterial,
  assertTeacherOwnsMaterialClass,
  getCourseMaterialForTeacher,
  listCourseMaterialsForTeacher,
  listCourseMaterialsForTeacherClass,
  listParentChildCourseMaterials,
  listStudentCourseMaterials,
} from "@/lib/repositories/course-material-repository";
import {
  findAllEnquiries,
  getEnquiryTimeline,
  listEnquiries,
} from "@/lib/repositories/enquiry-repository";
import {
  assertTeacherOwnsAssignment,
  assertTeacherOwnsClassForHomework,
  getHomeworkAssignmentById as getScopedHomeworkAssignmentById,
  listHomeworkAssignmentsForTeacher,
  listHomeworkAssignmentsForTeacherClass as listScopedHomeworkAssignmentsForTeacherClass,
} from "@/lib/repositories/homework-repository";
import {
  archiveHomeworkAssignment,
  archiveProgressNote,
  convertEnquiryToStudent,
  createHomeworkAssignment,
  createProgressNote as createLegacyProgressNote,
  createStudentSubmission,
  getHomeworkAssignmentById,
  getMaterialsForClass,
  getStudentAssignmentWithSubmissionHistory,
  gradeSubmissionForTeacher,
  listHomeworkAssignmentsForTeacherClass,
  listParentScopedSubmissions,
  listProgressNotesForStudentSubject,
  listProgressNotesForTeacherStudentSubject,
  listSubmissionsForAssignmentByTeacher,
  listTeacherHomework,
  recordStudentProgress,
  resubmitStudentSubmission,
  updateHomeworkAssignment,
  updateProgressNote as updateLegacyProgressNote,
} from "@/lib/repositories/portal-repository";
import {
  createReminderLog,
  getTeacherClassDetails,
  listUpcomingClassesForReminders,
} from "@/lib/repositories/schedule-repository";
import {
  assertTeacherCanWriteProgressForStudent,
  getProgressNoteForTeacher,
  listProgressNotesForParentChild,
  listProgressNotesForStudent,
  listProgressNotesForTeacher,
} from "@/lib/repositories/student-progress-repository";
import {
  getStudentAssignmentWithSubmission,
  getSubmissionForTeacher,
  listSubmissionsForAssignmentByTeacher as listScopedSubmissionsForAssignmentByTeacher,
} from "@/lib/repositories/submission-repository";
import {
  consumeAdminBackupCode,
  getChildren,
  getStudentProfile,
  getUsersByIds,
  listUsersByRole,
} from "@/lib/repositories/user-repository";
import { UserRole } from "@prisma/client";

/**
 * Audit-only wiring surface so static connectivity tests can distinguish
 * intentionally retained repository helpers from truly dead exports.
 * This module is not executed by runtime routes.
 */
export async function auditRepositoryUsageConnections() {
  await createLog({
    actorId: "admin-audit",
    actionType: "AUDIT",
    entityType: "Repository",
    metadata: {},
  });
  await getLogs({ limit: 1 });
  await listRecentAdminAuditLogs(1);
  await getRevenueMetrics();
  await getTeacherLessonAttendanceRoster("teacher-1", "class-1");
  await markLessonAttendanceForTeacher("teacher-1", {
    scheduledClassId: "class-1",
    studentId: "student-1",
    status: "PRESENT",
    now: new Date(),
  });
  await listAttendanceHistoryForStudent(
    { role: UserRole.TEACHER, userId: "teacher-1" },
    "student-1",
  );
  await listAttendanceHistoryForClassGroup("teacher-1", "group-1");
  await listStudentAttendance("student-1");
  await listParentChildAttendance("parent-1", "student-1");
  await getSubmissionsForStudent("assignment-1", "student-1");
  await findAssignmentById("assignment-1");
  await createManagerTask({
    title: "Audit task",
    description: "Connectivity audit",
    dueDate: new Date(),
  });
  await listPendingManagerTasks();
  await completeManagerTask("task-1");
  await getSubjects();
  await getRoster("class-1");
  await findClassById("class-1");
  await getPageBySlug("privacy-policy");
  await listContactLeads();
  await findAllContactLeads({ page: 1, limit: 1 });
  await getContactLeadTimeline("lead-1");
  await listEnquiries();
  await findAllEnquiries({ page: 1, limit: 1 });
  await getEnquiryTimeline("enquiry-1");
  await getMaterialsForClass("class-1");
  await assertTeacherOwnsMaterialClass("teacher-1", "class-1");
  await assertTeacherOwnsMaterial("teacher-1", "material-1");
  await getCourseMaterialForTeacher("material-1", "teacher-1");
  await listCourseMaterialsForTeacher("teacher-1");
  await listCourseMaterialsForTeacherClass("teacher-1", "class-1");
  await listStudentCourseMaterials("student-1");
  await listParentChildCourseMaterials("parent-1", "student-1");
  await assertTeacherOwnsClassForHomework("teacher-1", "class-1");
  await assertTeacherOwnsAssignment("teacher-1", "assignment-1");
  await getScopedHomeworkAssignmentById("assignment-1", "teacher-1");
  await listHomeworkAssignmentsForTeacher("teacher-1");
  await listScopedHomeworkAssignmentsForTeacherClass("teacher-1", "class-1");
  await createHomeworkAssignment({
    title: "Audit homework",
    description: "Audit description",
    classId: "class-1",
    dueDate: new Date(),
    teacherId: "teacher-1",
  });
  await updateHomeworkAssignment("assignment-1", "teacher-1", {
    title: "Audit homework updated",
  });
  await archiveHomeworkAssignment("assignment-1", "teacher-1");
  await getHomeworkAssignmentById("assignment-1", "teacher-1");
  await listHomeworkAssignmentsForTeacherClass("class-1", "teacher-1");
  await getStudentAssignmentWithSubmissionHistory({
    assignmentId: "assignment-1",
    studentId: "student-1",
  });
  await getStudentAssignmentWithSubmission("student-1", "assignment-1");
  await getSubmissionForTeacher("teacher-1", "submission-1");
  await listScopedSubmissionsForAssignmentByTeacher("teacher-1", "assignment-1");
  await createStudentSubmission({
    studentId: "student-1",
    assignmentId: "assignment-1",
    contentUrl: "audit-submission-ref",
  });
  await resubmitStudentSubmission({
    submissionId: "submission-1",
    studentId: "student-1",
    contentUrl: "audit-submission-ref",
  });
  await listTeacherHomework("teacher-1");
  await listSubmissionsForAssignmentByTeacher({
    teacherId: "teacher-1",
    assignmentId: "assignment-1",
  });
  await gradeSubmissionForTeacher({
    teacherId: "teacher-1",
    submissionId: "submission-1",
    grade: 100,
    feedback: "Audit feedback",
  });
  await convertEnquiryToStudent("enquiry-1");
  await listParentScopedSubmissions({ parentId: "parent-1", childId: "student-1" });
  await recordStudentProgress({
    studentId: "student-1",
    teacherId: "teacher-1",
    subjectId: "subject-1",
    gradeLevel: "GOOD",
    teacherNotes: "Audit note",
  });
  await createLegacyProgressNote({
    studentId: "student-1",
    teacherId: "teacher-1",
    subjectId: "subject-1",
    content: "Audit note",
    performanceLevel: "GOOD",
  });
  await updateLegacyProgressNote("progress-1", "teacher-1", {
    content: "Updated audit note",
    performanceLevel: "GOOD",
  });
  await listProgressNotesForStudentSubject({ studentId: "student-1", subjectId: "subject-1" });
  await archiveProgressNote("progress-1", "teacher-1");
  await listProgressNotesForTeacherStudentSubject({
    teacherId: "teacher-1",
    studentId: "student-1",
    subjectId: "subject-1",
  });
  await assertTeacherCanWriteProgressForStudent("teacher-1", "student-1", "subject-1");
  await getProgressNoteForTeacher("teacher-1", "progress-1");
  await listProgressNotesForTeacher("teacher-1");
  await listProgressNotesForStudent("student-1");
  await listProgressNotesForParentChild("parent-1", "student-1");
  await listUpcomingClassesForReminders(new Date(), new Date());
  await createReminderLog({
    scheduledClassId: "class-1",
    recipientUserId: "student-1",
    recipientEmail: "student@example.com",
    channel: "EMAIL",
    status: "SKIPPED",
  });
  await getTeacherClassDetails("teacher-1", "class-1");
  await getUsersByIds(["student-1"]);
  await listUsersByRole("STUDENT");
  await consumeAdminBackupCode("admin-1", ["backup-code-hash"]);
  await getChildren("parent-1");
  await getStudentProfile("student-1");
}
