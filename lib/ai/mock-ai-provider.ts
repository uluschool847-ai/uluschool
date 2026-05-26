import type { AiDraftRequest, AiDraftResponse } from "@/lib/ai/ai-provider";

function getRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function nameFrom(input: Record<string, unknown>) {
  const student = getRecord(input.student);
  const enquiry = getRecord(input.enquiry);
  return String(student.fullName ?? enquiry.studentName ?? enquiry.fullName ?? "the learner");
}

export class MockAiProvider {
  async generateDraft(request: AiDraftRequest): Promise<AiDraftResponse> {
    const name = nameFrom(request.input);
    const grades = getRecord(request.input.grades);
    const attendance = getRecord(request.input.attendance);

    if (request.type === "REPORT_COMMENT") {
      return {
        model: "local-deterministic",
        provider: "mock",
        text: `${name} is making steady progress. Current average: ${
          grades.weightedTermAverage ?? "not yet available"
        }. Attendance summary: present ${attendance.present ?? 0}, late ${
          attendance.late ?? 0
        }, absent ${attendance.absent ?? 0}. Please review and edit this draft before publishing.`,
      };
    }

    if (request.type === "CRM_FOLLOW_UP") {
      return {
        model: "local-deterministic",
        provider: "mock",
        text: `Follow up with the family for ${name}. Confirm learning goals, preferred schedule, payment readiness, and next action. This is a draft for admin review only.`,
      };
    }

    return {
      model: "local-deterministic",
      provider: "mock",
      text: `Draft suggestion for ${name}. Review and edit before sending.`,
    };
  }
}
