import type { Prisma } from "@prisma/client";

export function newestAttachmentOrderBy(): Prisma.AttachmentOrderByWithRelationInput[] {
  return [{ createdAt: "desc" }, { id: "desc" }];
}
