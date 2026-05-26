export type AiDraftRequest = {
  type: "REPORT_COMMENT" | "CRM_FOLLOW_UP" | "PARENT_SUMMARY" | "MESSAGE_COPY";
  input: Record<string, unknown>;
};

export type AiDraftResponse = {
  model: string;
  provider: string;
  text: string;
};

export type AiProvider = {
  generateDraft(request: AiDraftRequest): Promise<AiDraftResponse>;
};
