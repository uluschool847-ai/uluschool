import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";

const ROOT = process.cwd();
const APP_DIR = join(ROOT, "app");
const API_DIR = join(APP_DIR, "api");
const SEARCH_DIRS = [join(ROOT, "app"), join(ROOT, "components")];

type ApplicationHrefGenerator = {
  exportName: string;
  filePath: string;
  routePath: string;
};

const AUTHORIZED_APPLICATION_HREF_GENERATORS: readonly ApplicationHrefGenerator[] = [
  {
    exportName: "storageUrlForKey",
    filePath: join(ROOT, "lib", "storage", "storage-url.ts"),
    routePath: "/api/files/[token]",
  },
  {
    exportName: "storageUrlForKey",
    filePath: join(ROOT, "lib", "storage", "storage-url.ts"),
    routePath: "/api/public-files/[token]",
  },
];

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

function routePathFromFile(filePath: string) {
  const rel = relative(API_DIR, filePath).replace(/\\/g, "/");
  const stripped = rel.replace(/\/route\.tsx?$|\/route\.ts$/, "");
  return `/api/${stripped}`;
}

const apiRouteFiles = walk(API_DIR).filter(
  (filePath) =>
    /\/route\.tsx?$|\/route\.ts$/.test(filePath.replace(/\\/g, "/")) && !isTestFile(filePath),
);
const productionFiles = SEARCH_DIRS.flatMap((dir) => walk(dir)).filter(
  (filePath) => isCodeFile(filePath) && !isTestFile(filePath),
);

function exportedFunctionGeneratesRoute(registration: ApplicationHrefGenerator) {
  const sourceText = readFileSync(registration.filePath, "utf8");
  const source = ts.createSourceFile(
    registration.filePath,
    sourceText,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );
  const declaration = source.statements.find(
    (statement): statement is ts.FunctionDeclaration =>
      ts.isFunctionDeclaration(statement) &&
      statement.name?.text === registration.exportName &&
      Boolean(
        statement.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword),
      ),
  );
  if (!declaration?.body) return false;

  const routePrefix = registration.routePath.replace(/\/\[[^/]+\]$/, "");
  let hasRegisteredRoutePrefix = false;
  let hasDynamicRouteReturn = false;
  const visit = (node: ts.Node) => {
    if (ts.isStringLiteral(node) && node.text === routePrefix) {
      hasRegisteredRoutePrefix = true;
    }
    if (ts.isReturnStatement(node) && node.expression && ts.isTemplateExpression(node.expression)) {
      const literalParts = [
        node.expression.head.text,
        ...node.expression.templateSpans.map((span) => span.literal.text),
      ];
      if (
        node.expression.templateSpans.length >= 2 &&
        literalParts.some((part) => part.includes("/"))
      ) {
        hasDynamicRouteReturn = true;
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(declaration.body);
  return hasRegisteredRoutePrefix && hasDynamicRouteReturn;
}

function hasAuthorizedApplicationHrefGenerator(
  routePath: string,
  registrations: readonly ApplicationHrefGenerator[] = AUTHORIZED_APPLICATION_HREF_GENERATORS,
) {
  return registrations
    .filter((registration) => registration.routePath === routePath)
    .some(exportedFunctionGeneratesRoute);
}

describe("API routes connectivity", () => {
  it("does not authorize dynamic routes from unrelated constructs in one file", () => {
    expect(
      hasAuthorizedApplicationHrefGenerator("/api/files/[token]", [
        {
          exportName: "unrelatedUrl",
          filePath: join(ROOT, "app", "__tests__", "fixtures", "dynamic-href-decoy.fixture.ts"),
          routePath: "/api/files/[token]",
        },
      ]),
    ).toBe(false);
  });

  it("every route under app/api/ has at least one client-side caller", () => {
    const orphaned: string[] = [];

    for (const routeFile of apiRouteFiles) {
      const routePath = routePathFromFile(routeFile);
      const hasCaller =
        hasAuthorizedApplicationHrefGenerator(routePath) ||
        productionFiles.some((filePath) => {
          const content = readFileSync(filePath, "utf8");
          return new RegExp(
            `fetch\\([^)]*["']${routePath}|axios\\.[a-z]+\\([^)]*["']${routePath}|new URL\\(["']${routePath}`,
            "m",
          ).test(content);
        });

      if (!hasCaller) {
        orphaned.push(`API route has no caller: ${routePath} (${relative(ROOT, routeFile)})`);
      }
    }

    expect(orphaned, orphaned.join("\n")).toEqual([]);
  });

  it("no API route is imported as a module instead of called via HTTP", () => {
    const offenders: string[] = [];

    for (const filePath of productionFiles) {
      const content = readFileSync(filePath, "utf8");
      for (const match of content.matchAll(
        /from\s*["'](@\/app\/api\/[^"']+|\.\.\/.*app\/api\/[^"']+|\.\/api\/[^"']+)["']/g,
      )) {
        offenders.push(`Direct API route import in ${relative(ROOT, filePath)}: ${match[1]}`);
      }
    }

    expect(offenders, offenders.join("\n")).toEqual([]);
  });

  it("API routes are not used in Server Components (fetch should call external API or direct logic)", () => {
    const offenders: string[] = [];

    for (const filePath of productionFiles.filter((file) => file.startsWith(APP_DIR))) {
      const content = readFileSync(filePath, "utf8");
      const isClientComponent = /^\s*["']use client["']/.test(content);
      if (isClientComponent) continue;

      for (const routeFile of apiRouteFiles) {
        const routePath = routePathFromFile(routeFile);
        if (
          new RegExp(`fetch\\([^)]*["']${routePath}|new URL\\(["']${routePath}`, "m").test(content)
        ) {
          offenders.push(
            `Server Component calls local API route ${routePath} in ${relative(ROOT, filePath)}`,
          );
        }
      }
    }

    expect(offenders, offenders.join("\n")).toEqual([]);
  });
});
