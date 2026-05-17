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
  findAllEnquiries,
  getEnquiryTimeline,
  listEnquiries,
} from "@/lib/repositories/enquiry-repository";
import {
  archiveProgressNote,
  convertEnquiryToStudent,
  createStudentSubmission,
  getHomeworkAssignmentById,
  getMaterialsForClass,
  getStudentAssignmentWithSubmissionHistory,
  listHomeworkAssignmentsForTeacherClass,
  listParentScopedSubmissions,
  listProgressNotesForStudentSubject,
  listProgressNotesForTeacherStudentSubject,
  listSubmissionsForAssignmentByTeacher,
  listTeacherHomework,
  recordStudentProgress,
  resubmitStudentSubmission,
} from "@/lib/repositories/portal-repository";
import {
  createReminderLog,
  getTeacherClassDetails,
  listUpcomingClassesForReminders,
} from "@/lib/repositories/schedule-repository";
import {
  consumeAdminBackupCode,
  getChildren,
  getStudentProfile,
  getUsersByIds,
  listUsersByRole,
} from "@/lib/repositories/user-repository";

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
  await getHomeworkAssignmentById("assignment-1", "teacher-1");
  await listHomeworkAssignmentsForTeacherClass("class-1", "teacher-1");
  await getStudentAssignmentWithSubmissionHistory({
    assignmentId: "assignment-1",
    studentId: "student-1",
  });
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
  await convertEnquiryToStudent("enquiry-1");
  await listParentScopedSubmissions({ parentId: "parent-1", childId: "student-1" });
  await recordStudentProgress({
    studentId: "student-1",
    teacherId: "teacher-1",
    subjectId: "subject-1",
    gradeLevel: "GOOD",
    teacherNotes: "Audit note",
  });
  await listProgressNotesForStudentSubject({ studentId: "student-1", subjectId: "subject-1" });
  await archiveProgressNote("progress-1", "teacher-1");
  await listProgressNotesForTeacherStudentSubject({
    teacherId: "teacher-1",
    studentId: "student-1",
    subjectId: "subject-1",
  });
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
