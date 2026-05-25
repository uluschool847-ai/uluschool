export function safeCourseMaterialHref(value: string | null | undefined) {
  const trimmed = value?.trim() ?? "";
  if (!trimmed) return null;
  if (trimmed.startsWith("/uploads/")) return trimmed;

  try {
    const url = new URL(trimmed);
    if (
      url.protocol === "http:" &&
      ["localhost", "127.0.0.1", "::1"].includes(url.hostname) &&
      url.pathname.startsWith("/e2e-assets/")
    ) {
      return trimmed;
    }
    return url.protocol === "https:" ? trimmed : null;
  } catch {
    return null;
  }
}
