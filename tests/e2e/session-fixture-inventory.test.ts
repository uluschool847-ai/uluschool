import { readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";

const ROOT = process.cwd();
const E2E_ROOT = join(ROOT, "e2e");
const SHARED_HELPER_IMPORT = "@/e2e/helpers/session";
const EXPECTED_SIGNER_SPECS = 39;
const EXPECTED_COOKIE_WRITES = 40;
const OUTLIERS = [
  "e2e/portals/admin-security.spec.ts",
  "e2e/portals/parent-billing.spec.ts",
  "e2e/portals/parent-dashboard.spec.ts",
  "e2e/portals/parent-student-side-effects.spec.ts",
];

function walk(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? walk(path) : entry.name.endsWith(".spec.ts") ? [path] : [];
  });
}

function propertyName(node: ts.ObjectLiteralElementLike) {
  return ts.isPropertyAssignment(node) &&
    (ts.isIdentifier(node.name) || ts.isStringLiteral(node.name))
    ? node.name.text
    : undefined;
}

function isAddCookiesCall(node: ts.CallExpression) {
  return (
    ts.isPropertyAccessExpression(node.expression) && node.expression.name.text === "addCookies"
  );
}

function cookieWrites(sourceFile: ts.SourceFile) {
  const writes: ts.PropertyAssignment[] = [];
  const visit = (node: ts.Node) => {
    if (ts.isCallExpression(node) && isAddCookiesCall(node)) {
      node.forEachChild((child) => {
        if (!ts.isArrayLiteralExpression(child)) return;
        for (const element of child.elements) {
          if (!ts.isObjectLiteralExpression(element)) return;
          for (const property of element.properties) {
            if (
              ts.isPropertyAssignment(property) &&
              propertyName(property) === "name" &&
              ts.isStringLiteral(property.initializer) &&
              property.initializer.text === "ulu_session"
            ) {
              writes.push(property);
            }
          }
        }
      });
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return writes;
}

function hasLocalCreateSessionToken(sourceFile: ts.SourceFile) {
  let found = false;
  const visit = (node: ts.Node) => {
    if (
      (ts.isFunctionDeclaration(node) && node.name?.text === "createSessionToken") ||
      (ts.isVariableDeclaration(node) &&
        ts.isIdentifier(node.name) &&
        node.name.text === "createSessionToken")
    ) {
      found = true;
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return found;
}

function hasLocalHmacSessionSigning(sourceFile: ts.SourceFile) {
  let found = false;
  const visit = (node: ts.Node) => {
    if (
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression) &&
      (node.expression.name.text === "importKey" || node.expression.name.text === "sign")
    ) {
      found = true;
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return found;
}

function importsSharedHelper(sourceFile: ts.SourceFile) {
  return sourceFile.statements.some(
    (statement) =>
      ts.isImportDeclaration(statement) &&
      ts.isStringLiteral(statement.moduleSpecifier) &&
      statement.moduleSpecifier.text === SHARED_HELPER_IMPORT,
  );
}

function callsSharedHelper(sourceFile: ts.SourceFile) {
  let found = false;
  const visit = (node: ts.Node) => {
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression)) {
      found ||= node.expression.text === "createSessionToken";
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return found;
}

describe("Playwright ulu_session fixture inventory", () => {
  it("uses the shared purpose-bound helper for every signed session cookie write", () => {
    const specs = walk(E2E_ROOT).map((path) => {
      const sourceFile = ts.createSourceFile(
        path,
        readFileSync(path, "utf8"),
        ts.ScriptTarget.Latest,
        true,
      );
      return { path: relative(ROOT, path).replaceAll("\\", "/"), sourceFile };
    });
    const sessionSpecs = specs.filter(({ sourceFile }) => cookieWrites(sourceFile).length > 0);

    expect(sessionSpecs).toHaveLength(EXPECTED_SIGNER_SPECS);
    expect(sessionSpecs.flatMap(({ sourceFile }) => cookieWrites(sourceFile))).toHaveLength(
      EXPECTED_COOKIE_WRITES,
    );
    expect(sessionSpecs.map(({ path }) => path)).toEqual(expect.arrayContaining(OUTLIERS));
    const parentDashboardSpec = sessionSpecs.find(
      ({ path }) => path === "e2e/portals/parent-dashboard.spec.ts",
    );
    expect(parentDashboardSpec ? cookieWrites(parentDashboardSpec.sourceFile) : []).toHaveLength(2);

    const localSigners = sessionSpecs.filter(({ sourceFile }) =>
      hasLocalCreateSessionToken(sourceFile),
    );
    const localHmac = sessionSpecs.filter(({ sourceFile }) =>
      hasLocalHmacSessionSigning(sourceFile),
    );
    const missingSharedHelper = sessionSpecs.filter(
      ({ sourceFile }) => !importsSharedHelper(sourceFile) || !callsSharedHelper(sourceFile),
    );

    expect(localSigners.map(({ path }) => path)).toEqual([]);
    expect(localHmac.map(({ path }) => path)).toEqual([]);
    expect(missingSharedHelper.map(({ path }) => path)).toEqual([]);
  });
});
