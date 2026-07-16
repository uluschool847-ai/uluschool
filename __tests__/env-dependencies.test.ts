import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = process.cwd();
const ENV_FILES = [join(ROOT, ".env.example"), join(ROOT, ".env.local.example")].filter(existsSync);
const SCAN_DIRS = [join(ROOT, "app"), join(ROOT, "components"), join(ROOT, "lib"), ROOT];

type WalkFileSystem = {
  readdirSync: (path: string) => string[];
  statSync: (path: string) => { isDirectory: () => boolean };
};
type ReadFile = (path: string, encoding: BufferEncoding) => string;

function isConcurrentDisappearance(error: unknown) {
  return typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT";
}

function readFileIfPresent(filePath: string, readFile: ReadFile = readFileSync) {
  try {
    return readFile(filePath, "utf8");
  } catch (error) {
    if (isConcurrentDisappearance(error)) return null;
    throw error;
  }
}

function walk(dir: string, fileSystem: WalkFileSystem = { readdirSync, statSync }): string[] {
  let entries: string[];
  try {
    entries = fileSystem.readdirSync(dir);
  } catch (error) {
    if (isConcurrentDisappearance(error)) return [];
    throw error;
  }

  return entries.flatMap((entry) => {
    const fullPath = join(dir, entry);
    let stats: { isDirectory: () => boolean };
    try {
      stats = fileSystem.statSync(fullPath);
    } catch (error) {
      if (isConcurrentDisappearance(error)) return [];
      throw error;
    }
    if (stats.isDirectory()) {
      if (["node_modules", ".git", ".next", "coverage"].includes(entry)) return [];
      return walk(fullPath, fileSystem);
    }
    return fullPath;
  });
}

function isScannableCodeFile(filePath: string) {
  return (
    /\.(ts|tsx|js|jsx)$/.test(filePath) &&
    !/(__tests__|\.test\.)/.test(filePath) &&
    !/\.env\./.test(filePath)
  );
}

const codeFiles = [
  ...new Set(SCAN_DIRS.flatMap((dir) => (existsSync(dir) ? walk(dir) : []))),
].filter(isScannableCodeFile);
const envContent = ENV_FILES.map((filePath) => readFileSync(filePath, "utf8")).join("\n");

function collectEnvUsages() {
  const usages: Array<{ variable: string; file: string; line: string }> = [];
  for (const filePath of codeFiles) {
    const content = readFileIfPresent(filePath);
    if (content === null) continue;
    for (const match of content.matchAll(/process\.env\.([A-Z0-9_]+)/g)) {
      const variable = match[1];
      const line = content.slice(0, match.index).split(/\r?\n/).length;
      const lineContent = content.split(/\r?\n/)[line - 1] ?? "";
      usages.push({ variable, file: filePath, line: lineContent.trim() });
    }
  }
  return usages;
}

describe("Environment variable dependencies", () => {
  it("skips only source entries that disappear during the audit walk", () => {
    const root = join(ROOT, "race-fixture");
    const stablePath = join(root, "stable.ts");
    const disappearingPath = join(root, "disappearing.ts");
    const enoent = Object.assign(new Error("disappeared"), { code: "ENOENT" });

    expect(
      walk(root, {
        readdirSync: () => ["stable.ts", "disappearing.ts"],
        statSync: (filePath) => {
          if (filePath === disappearingPath) throw enoent;
          return { isDirectory: () => false };
        },
      }),
    ).toEqual([stablePath]);
    expect(
      readFileIfPresent(disappearingPath, () => {
        throw enoent;
      }),
    ).toBeNull();
  });

  it("every process.env.* reference has a corresponding entry in .env.example", () => {
    const missing: string[] = [];

    for (const usage of collectEnvUsages()) {
      const declared = new RegExp(`^${usage.variable}=|^${usage.variable}\s*=`, "m").test(
        envContent,
      );
      if (!declared) {
        missing.push(
          `Missing from .env.example: ${usage.variable} used in ${relative(ROOT, usage.file)}`,
        );
      }
    }

    expect(missing, missing.join("\n")).toEqual([]);
  });

  it("no hardcoded secrets or URLs exist outside .env files", () => {
    const offenders: string[] = [];
    const suspiciousRegexes = [
      /(secret|token|password|api[_-]?key|webhook|dsn|url)\s*[:=]\s*["']https?:\/\//i,
      /(secret|token|password|api[_-]?key)\s*[:=]\s*["'][^"']{6,}["']/i,
      /sk-[A-Za-z0-9]{10,}/,
    ];

    for (const filePath of codeFiles) {
      const content = readFileIfPresent(filePath);
      if (content === null) continue;
      const lines = content.split(/\r?\n/);
      lines.forEach((line, index) => {
        if (line.includes("process.env.")) return;
        if (line.includes("otpauth://")) return;
        for (const regex of suspiciousRegexes) {
          if (regex.test(line)) {
            offenders.push(
              `Possible hardcoded secret or URL in ${relative(ROOT, filePath)}:${index + 1}: ${line.trim()}`,
            );
            break;
          }
        }
      });
    }

    expect(offenders, offenders.join("\n")).toEqual([]);
  });

  it("every env variable used in production code is validated at startup or has a fallback", () => {
    const unsafe: string[] = [];

    for (const usage of collectEnvUsages()) {
      const line = usage.line;
      const envReferenceRegex = new RegExp(`process\\.env\\.${usage.variable}\\b`);
      const match = envReferenceRegex.exec(line);
      const expressionAfterEnv = match ? line.slice(match.index + match[0].length) : "";
      const hasFallbackOrValidation =
        /\?\?/.test(expressionAfterEnv) ||
        /\|\|/.test(expressionAfterEnv) ||
        /\?[^:]+:[^:]+/.test(expressionAfterEnv);

      if (!hasFallbackOrValidation) {
        unsafe.push(
          `Env var used without validation/fallback: ${usage.variable} in ${relative(ROOT, usage.file)} -> ${line}`,
        );
      }
    }

    expect(unsafe, unsafe.join("\n")).toEqual([]);
  });
});
