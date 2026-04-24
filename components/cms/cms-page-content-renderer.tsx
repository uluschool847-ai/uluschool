import Link from "next/link";

import { Button } from "@/components/ui/button";

type JsonPrimitive = string | number | boolean | null;
type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };

function readString(record: Record<string, JsonValue>, keys: string[]) {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }
  return "";
}

function normalizeItems(value: JsonValue | undefined): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => {
      if (typeof item === "string") {
        return item.trim();
      }

      if (item && typeof item === "object" && !Array.isArray(item)) {
        return readString(item as Record<string, JsonValue>, ["text", "content", "label", "title"]);
      }

      return "";
    })
    .filter(Boolean);
}

function renderBlock(block: JsonValue, index: number) {
  if (typeof block === "string") {
    return (
      <p key={`text-${index}`} className="text-base leading-7 text-foreground/90">
        {block}
      </p>
    );
  }

  if (!block || typeof block !== "object" || Array.isArray(block)) {
    return null;
  }

  const entry = block as Record<string, JsonValue>;
  const type = readString(entry, ["type"]).toLowerCase();

  if (type === "heading" || type === "title" || type === "h2" || type === "h3") {
    const text = readString(entry, ["text", "title", "content", "value"]);
    const levelRaw = entry.level;
    const level = typeof levelRaw === "number" ? levelRaw : Number(levelRaw);

    if (!text) return null;
    if (level >= 3 || type === "h3") {
      return (
        <h3 key={`heading-${index}`} className="text-2xl font-semibold text-primary">
          {text}
        </h3>
      );
    }

    return (
      <h2 key={`heading-${index}`} className="text-3xl font-semibold text-primary">
        {text}
      </h2>
    );
  }

  if (
    type === "paragraph" ||
    type === "text" ||
    type === "lead" ||
    type === "description" ||
    type === ""
  ) {
    const text = readString(entry, ["text", "content", "body", "description", "value"]);
    if (!text) return null;
    return (
      <p key={`paragraph-${index}`} className="text-base leading-7 text-foreground/90">
        {text}
      </p>
    );
  }

  if (type === "list" || type === "bullets" || type === "ordered-list") {
    const items = normalizeItems(entry.items);
    if (items.length === 0) return null;
    const ordered = type === "ordered-list" || entry.ordered === true;
    const Tag = ordered ? "ol" : "ul";
    return (
      <Tag key={`list-${index}`} className={ordered ? "list-decimal space-y-2 pl-6" : "list-disc space-y-2 pl-6"}>
        {items.map((item) => (
          <li key={`${item}-${index}`} className="text-base text-foreground/90">
            {item}
          </li>
        ))}
      </Tag>
    );
  }

  if (type === "quote" || type === "testimonial") {
    const text = readString(entry, ["text", "quote", "content", "body"]);
    if (!text) return null;
    return (
      <blockquote key={`quote-${index}`} className="border-l-4 border-accent pl-4 italic text-foreground/90">
        {text}
      </blockquote>
    );
  }

  if (type === "cta" || type === "button" || type === "link") {
    const href = readString(entry, ["href", "url", "to"]);
    const label = readString(entry, ["label", "text", "title"]) || "Open";
    if (!href) return null;

    const isExternal = href.startsWith("http://") || href.startsWith("https://");
    return (
      <div key={`cta-${index}`} className="pt-2">
        <Button asChild>
          {isExternal ? (
            <a href={href} target="_blank" rel="noreferrer">
              {label}
            </a>
          ) : (
            <Link href={href}>{label}</Link>
          )}
        </Button>
      </div>
    );
  }

  if (type === "divider") {
    return <hr key={`divider-${index}`} className="border-secondary" />;
  }

  const fallbackText = readString(entry, ["text", "content", "body", "description", "title"]);
  if (fallbackText) {
    return (
      <p key={`fallback-${index}`} className="text-base leading-7 text-foreground/90">
        {fallbackText}
      </p>
    );
  }

  return (
    <pre
      key={`json-${index}`}
      className="overflow-x-auto rounded-lg border border-secondary bg-secondary/20 p-3 text-xs text-muted-foreground"
    >
      {JSON.stringify(block, null, 2)}
    </pre>
  );
}

export function getCmsContentSummary(content: unknown) {
  if (!content || typeof content !== "object" || Array.isArray(content)) {
    return "";
  }

  const record = content as Record<string, JsonValue>;
  const direct = readString(record, ["summary", "description", "excerpt", "lead"]);
  if (direct) return direct;

  if (Array.isArray(record.blocks)) {
    for (const block of record.blocks) {
      if (block && typeof block === "object" && !Array.isArray(block)) {
        const text = readString(block as Record<string, JsonValue>, ["text", "content", "body", "description"]);
        if (text) {
          return text;
        }
      }
      if (typeof block === "string" && block.trim()) {
        return block.trim();
      }
    }
  }

  return "";
}

export function CmsPageContentRenderer({ content }: { content: unknown }) {
  if (!content) {
    return (
      <p className="text-sm text-muted-foreground">
        No content blocks have been added to this page yet.
      </p>
    );
  }

  if (typeof content === "string") {
    return <p className="text-base leading-7 text-foreground/90">{content}</p>;
  }

  if (Array.isArray(content)) {
    const rendered = content.map((block, index) => renderBlock(block as JsonValue, index)).filter(Boolean);
    if (rendered.length === 0) {
      return (
        <p className="text-sm text-muted-foreground">
          No renderable content blocks were found.
        </p>
      );
    }
    return <div className="space-y-5">{rendered}</div>;
  }

  if (typeof content === "object") {
    const record = content as Record<string, JsonValue>;
    const blocks = Array.isArray(record.blocks) ? record.blocks : [];
    const rendered = blocks.map((block, index) => renderBlock(block, index)).filter(Boolean);

    if (rendered.length > 0) {
      return <div className="space-y-5">{rendered}</div>;
    }

    const summary = getCmsContentSummary(content);
    if (summary) {
      return <p className="text-base leading-7 text-foreground/90">{summary}</p>;
    }

    return (
      <pre className="overflow-x-auto rounded-lg border border-secondary bg-secondary/20 p-3 text-xs text-muted-foreground">
        {JSON.stringify(content, null, 2)}
      </pre>
    );
  }

  return (
    <p className="text-sm text-muted-foreground">
      Unsupported content format.
    </p>
  );
}
