import { safeStoredFileHref } from "@/lib/security/storage-links";

export function safeCourseMaterialHref(value: string | null | undefined) {
  return safeStoredFileHref(value);
}
