import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = process.cwd();
const REPOSITORIES_DIR = join(ROOT, "lib", "repositories");
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

function isCodeFile(filePath: string) {
  return /\.(ts|tsx)$/.test(filePath);
}

function isTestFile(filePath: string) {
  return /(__tests__|\.test\.(ts|tsx)$)/.test(filePath);
}

function parseRepositoryExports(filePath: string) {
  const content = readFileSync(filePath, "utf8");
  const names = new Set<string>();
  const functionRegexes = [
    /export\s+(?:async\s+)?function\s+([A-Za-z0-9_]+)/g,
    /export\s+const\s+([A-Za-z0-9_]+)\s*=\s*(?:async\s*)?(?:\([^)]*\)|[A-Za-z0-9_]+)\s*=>/g,
  ];

  for (const regex of functionRegexes) {
    for (const match of content.matchAll(regex)) {
      names.add(match[1]);
    }
  }

  return [...names];
}

function parseNamedImports(filePath: string) {
  const content = readFileSync(filePath, "utf8");
  const imports: Array<{ imported: string; local: string; from: string }> = [];
  const regex = /import\s*{([^}]+)}\s*from\s*["']([^"']+)["']/g;

  for (const match of content.matchAll(regex)) {
    const specifiers = match[1]
      .split(",")
      .map((part) => part.trim())
      .filter(Boolean);
    for (const specifier of specifiers) {
      const [imported, localAlias] = specifier.split(/\s+as\s+/).map((part) => part.trim());
      imports.push({
        imported,
        local: localAlias ?? imported,
        from: match[2],
      });
    }
  }

  return { content, imports };
}

function stripImportLines(content: string) {
  return content
    .split(/\r?\n/)
    .filter((line) => !line.trim().startsWith("import "))
    .join("\n");
}

const repositoryFiles = walk(REPOSITORIES_DIR).filter(
  (filePath) => isCodeFile(filePath) && !isTestFile(filePath),
);
const featureFiles = FEATURE_DIRS.flatMap((dir) => walk(dir)).filter(
  (filePath) => isCodeFile(filePath) && !isTestFile(filePath),
);

const repositoryExportEntries = repositoryFiles.flatMap((repositoryFile) => {
  const repositoryBaseName = repositoryFile.replace(/.*[\\/]/, "").replace(/\.ts$/, "");
  return parseRepositoryExports(repositoryFile).map((exportName) => ({
    exportName,
    repositoryBaseName,
    repositoryFile,
  }));
});

const featureSnapshots = featureFiles.map((featureFile) => {
  const { content, imports } = parseNamedImports(featureFile);
  return {
    body: stripImportLines(content),
    featureFile,
    imports,
  };
});

function importTargetsRepository(importSource: string, repositoryBaseName: string) {
  return (
    importSource === `@/lib/repositories/${repositoryBaseName}` ||
    importSource.endsWith(`/lib/repositories/${repositoryBaseName}`) ||
    importSource === `./${repositoryBaseName}` ||
    importSource === `../${repositoryBaseName}`
  );
}

describe("Repository usage audit", () => {
  it("every exported function in lib/repositories is imported by at least one feature file", () => {
    const unused: string[] = [];

    for (const { exportName, repositoryBaseName, repositoryFile } of repositoryExportEntries) {
      const importedSomewhere = featureSnapshots.some(({ imports }) =>
        imports.some(
          (entry) =>
            entry.imported === exportName &&
            importTargetsRepository(entry.from, repositoryBaseName),
        ),
      );

      if (!importedSomewhere) {
        unused.push(`Unused export: ${exportName} from ${relative(ROOT, repositoryFile)}`);
      }
    }

    expect(unused, unused.join("\n")).toEqual([]);
  });

  it("every repository function call is inside a real feature, not just a test file", () => {
    const notCalled: string[] = [];

    for (const { exportName, repositoryBaseName, repositoryFile } of repositoryExportEntries) {
      const calledInFeature = featureSnapshots.some(({ body, imports }) => {
        const matchingImport = imports.find(
          (entry) =>
            entry.imported === exportName &&
            importTargetsRepository(entry.from, repositoryBaseName),
        );
        if (!matchingImport) return false;

        const callRegex = new RegExp(`\\b${matchingImport.local}\\s*\\(`);
        const memberCallRegex = new RegExp(`\\b${matchingImport.local}\\.[A-Za-z0-9_]+\\s*\\(`);
        return callRegex.test(body) || memberCallRegex.test(body);
      });

      if (!calledInFeature) {
        notCalled.push(
          `Repository function only imported or only used in tests: ${exportName} from ${relative(ROOT, repositoryFile)}`,
        );
      }
    }

    expect(notCalled, notCalled.join("\n")).toEqual([]);
  });
});
