type StudentMaterial = {
  id: string;
  title: string;
  description?: string | null;
  fileUrl: string;
  safeFileUrl?: string | null;
  attachments?: Array<{
    filename: string;
    href?: string | null;
    mimeType?: string | null;
    size?: number | null;
  }>;
  className?: string;
  scheduledClass?: { id?: string; title?: string; startAt?: Date | string | null } | null;
  classGroup?: { id?: string; name?: string } | null;
  subject?: { id?: string; name?: string } | null;
  subjectName?: string;
  createdAt?: Date | string | null;
  updatedAt?: Date | string | null;
};

type StudentMaterialListProps = {
  materials: StudentMaterial[];
  emptyMessage?: string;
};

function isSafeHref(value: string | null | undefined) {
  const trimmed = value?.trim() ?? "";
  if (!trimmed) return false;
  if (trimmed.startsWith("/uploads/")) return true;

  try {
    const url = new URL(trimmed);
    if (
      url.protocol === "http:" &&
      ["localhost", "127.0.0.1", "::1"].includes(url.hostname) &&
      url.pathname.startsWith("/e2e-assets/")
    ) {
      return true;
    }
    return url.protocol === "https:";
  } catch {
    return false;
  }
}

function safeHref(value: string | null | undefined) {
  return isSafeHref(value) ? (value?.trim() ?? null) : null;
}

function formatDate(value: Date | string | null | undefined) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(date);
}

function materialHref(material: StudentMaterial) {
  return safeHref(material.safeFileUrl ?? material.fileUrl);
}

export function StudentMaterialList({
  emptyMessage = "No materials available yet.",
  materials,
}: StudentMaterialListProps) {
  if (materials.length === 0) {
    return <p>{emptyMessage}</p>;
  }

  return (
    <div className="space-y-4">
      {materials.map((material, index) => {
        const href = materialHref(material);
        const lessonTitle = material.scheduledClass?.title ?? material.className ?? "Unknown class";
        const subjectName = material.subject?.name ?? material.subjectName;
        const created = formatDate(material.createdAt);
        const updated = formatDate(material.updatedAt);

        return (
          <article
            key={material.id}
            aria-label={material.title}
            className="space-y-2 rounded-md border p-4"
          >
            <p className="text-xs text-muted-foreground">Class: {lessonTitle}</p>
            {material.classGroup?.name ? (
              <p className="text-xs text-muted-foreground">Group: {material.classGroup.name}</p>
            ) : null}
            {subjectName ? (
              <p className="text-xs text-muted-foreground">Subject: {subjectName}</p>
            ) : null}
            <h3 className="font-semibold">{material.title}</h3>
            {material.description ? <p className="text-sm">{material.description}</p> : null}
            <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
              {created ? <span>Created: {created}</span> : null}
              {updated ? <span>Updated: {updated}</span> : null}
            </div>

            {href ? (
              <a href={href} target="_blank" rel="noreferrer" className="text-sm underline">
                {materials.length === 1 ? "Open material" : "View file"}
              </a>
            ) : (
              <p className="text-sm text-muted-foreground">File unavailable</p>
            )}

            {material.attachments && material.attachments.length > 0 ? (
              <ul className="list-disc space-y-1 pl-5 text-sm" aria-label="Attachments">
                {material.attachments.map((attachment) => {
                  const attachmentLink = safeHref(attachment.href);
                  return (
                    <li key={`${material.id}-${attachment.filename}`}>
                      {attachmentLink ? (
                        <a href={attachmentLink} target="_blank" rel="noreferrer">
                          {attachment.filename}
                        </a>
                      ) : (
                        <span>{attachment.filename}</span>
                      )}
                    </li>
                  );
                })}
              </ul>
            ) : null}
          </article>
        );
      })}
    </div>
  );
}
