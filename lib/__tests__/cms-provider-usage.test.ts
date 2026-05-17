import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = process.cwd();
const CMS_DIR = join(ROOT, "lib", "cms");
const PROVIDER_FILE = join(CMS_DIR, "provider.ts");
const FEATURE_DIRS = [join(ROOT, "app"), join(ROOT, "components")];

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const fullPath = join(dir, entry);
    const stats = statSync(fullPath);
    if (stats.isDirectory()) {
      return walk(fullPath);
    }
    return fullPath;
  });
}

function isProductionCode(filePath: string) {
  return /\.(ts|tsx)$/.test(filePath) && !/__tests__|\.test\.(ts|tsx)$/.test(filePath);
}

function parseValueExports(filePath: string) {
  const content = readFileSync(filePath, "utf8");
  const names = new Set<string>();
  const regexes = [
    /export\s+(?:async\s+)?function\s+([A-Za-z0-9_]+)/g,
    /export\s+const\s+([A-Za-z0-9_]+)/g,
    /export\s+class\s+([A-Za-z0-9_]+)/g,
  ];

  for (const regex of regexes) {
    for (const match of content.matchAll(regex)) {
      names.add(match[1]);
    }
  }

  return [...names];
}

const featureFiles = FEATURE_DIRS.flatMap((dir) => walk(dir)).filter(isProductionCode);

describe("CMS provider audit", () => {
  it("every exported CMS function from lib/cms/provider.ts is called in production code", () => {
    const exports = parseValueExports(PROVIDER_FILE);
    const unused: string[] = [];

    for (const exportName of exports) {
      const called = featureFiles.some((filePath) => {
        const raw = readFileSync(filePath, "utf8");
        const imports: Array<{ imported: string; local: string; from: string }> = [];
        const namedImportRegex = /import\s*{([^}]+)}\s*from\s*["']([^"']+)["']/g;
        const defaultImportRegex = /import\s+([A-Za-z0-9_]+)\s+from\s*["']([^"']+)["']/g;

        for (const match of raw.matchAll(namedImportRegex)) {
          const specifiers = match[1]
            .split(",")
            .map((part) => part.trim())
            .filter(Boolean);
          for (const specifier of specifiers) {
            const [imported, localAlias] = specifier.split(/\s+as\s+/).map((part) => part.trim());
            imports.push({ imported, local: localAlias ?? imported, from: match[2] });
          }
        }
        for (const match of raw.matchAll(defaultImportRegex)) {
          imports.push({ imported: "default", local: match[1], from: match[2] });
        }

        const imported = imports.find(
          (entry) =>
            entry.from === "@/lib/cms/provider" &&
            (entry.imported === exportName ||
              (exportName === "cmsProvider" && entry.imported === "default")),
        );
        if (!imported) return false;

        const body = raw.replace(/^import .*$/gm, "");
        return new RegExp(
          `\\b${imported.local}\\s*\\(|\\b${imported.local}\\.[A-Za-z0-9_]+\\s*\\(`,
        ).test(body);
      });

      if (!called) {
        unused.push(
          `Unused CMS provider export: ${exportName} from ${relative(ROOT, PROVIDER_FILE)}`,
        );
      }
    }

    expect(unused, unused.join("\n")).toEqual([]);
  });

  it("CMS provider stubs are explicitly marked as @deferred or removed", () => {
    const content = readFileSync(PROVIDER_FILE, "utf8");
    const exportedValues = parseValueExports(PROVIDER_FILE);
    const hasDeferredTag = /@deferred/.test(content);
    const hasStubSignal = /return\s+null\s*;|TODO|mock|stub|hardcoded/i.test(content);

    const exportedStub = exportedValues.length > 0 && hasStubSignal;

    expect(
      exportedStub && !hasDeferredTag,
      `Exported CMS stub without @deferred documentation in ${relative(ROOT, PROVIDER_FILE)}`,
    ).toBe(false);
  });
});
