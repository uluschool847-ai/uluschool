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

type SessionCookieWrite = {
  cookieObject: ts.ObjectLiteralExpression;
  valueExpression: ts.Expression | undefined;
};

function propertyAssignment(object: ts.ObjectLiteralExpression, name: string) {
  return object.properties.find(
    (property): property is ts.PropertyAssignment =>
      ts.isPropertyAssignment(property) && propertyName(property) === name,
  );
}

function cookieWrites(sourceFile: ts.SourceFile) {
  const writes: SessionCookieWrite[] = [];
  const visit = (node: ts.Node) => {
    if (ts.isCallExpression(node) && isAddCookiesCall(node)) {
      for (const argument of node.arguments) {
        if (!ts.isArrayLiteralExpression(argument)) continue;
        for (const element of argument.elements) {
          if (!ts.isObjectLiteralExpression(element)) continue;
          const nameProperty = propertyAssignment(element, "name");
          if (
            nameProperty &&
            ts.isStringLiteral(nameProperty.initializer) &&
            nameProperty.initializer.text === "ulu_session"
          ) {
            writes.push({
              cookieObject: element,
              valueExpression: propertyAssignment(element, "value")?.initializer,
            });
          }
        }
      }
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
        node.name.text === "createSessionToken") ||
      (ts.isParameter(node) &&
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
      statement.moduleSpecifier.text === SHARED_HELPER_IMPORT &&
      statement.importClause?.namedBindings !== undefined &&
      ts.isNamedImports(statement.importClause.namedBindings) &&
      statement.importClause.namedBindings.elements.some(
        (element) =>
          (element.propertyName?.text ?? element.name.text) === "createSessionToken" &&
          element.name.text === "createSessionToken",
      ),
  );
}

function awaitedCall(expression: ts.Expression | undefined, name: string) {
  if (!expression || !ts.isAwaitExpression(expression)) return undefined;
  const call = expression.expression;
  return ts.isCallExpression(call) &&
    ts.isIdentifier(call.expression) &&
    call.expression.text === name
    ? call
    : undefined;
}

function isIdentifier(expression: ts.Expression, name: string) {
  return ts.isIdentifier(expression) && expression.text === name;
}

function isParentRole(expression: ts.Expression) {
  return (
    ts.isPropertyAccessExpression(expression) &&
    isIdentifier(expression.expression, "UserRole") &&
    expression.name.text === "PARENT"
  );
}

function hasPreservedParentBillingIdentity(object: ts.ObjectLiteralExpression) {
  if (object.properties.length !== 5) return false;
  const email = propertyAssignment(object, "email")?.initializer;
  const fullName = propertyAssignment(object, "fullName")?.initializer;
  const mfaVerified = propertyAssignment(object, "mfaVerified")?.initializer;
  const role = propertyAssignment(object, "role")?.initializer;
  const uid = propertyAssignment(object, "uid")?.initializer;

  return Boolean(
    email &&
      isIdentifier(email, "parentEmail") &&
      fullName &&
      ts.isStringLiteral(fullName) &&
      fullName.text === "QA Parent Billing" &&
      mfaVerified?.kind === ts.SyntaxKind.TrueKeyword &&
      role &&
      isParentRole(role) &&
      uid &&
      isIdentifier(uid, "parentId"),
  );
}

function hasValidParentBillingWrapper(sourceFile: ts.SourceFile) {
  const wrapper = sourceFile.statements.find(
    (statement): statement is ts.FunctionDeclaration =>
      ts.isFunctionDeclaration(statement) && statement.name?.text === "createParentSessionToken",
  );
  if (
    !wrapper?.body ||
    wrapper.parameters.length !== 0 ||
    !wrapper.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.AsyncKeyword) ||
    wrapper.body.statements.length !== 1
  ) {
    return false;
  }

  const returnStatement = wrapper.body.statements[0];
  if (!ts.isReturnStatement(returnStatement)) return false;
  const helperCall = awaitedCall(returnStatement.expression, "createSessionToken");
  return Boolean(
    helperCall &&
      helperCall.arguments.length === 1 &&
      ts.isObjectLiteralExpression(helperCall.arguments[0]) &&
      hasPreservedParentBillingIdentity(helperCall.arguments[0]),
  );
}

function callsSharedHelper(sourceFile: ts.SourceFile) {
  if (!importsSharedHelper(sourceFile) || hasLocalCreateSessionToken(sourceFile)) return false;
  const writes = cookieWrites(sourceFile);
  if (writes.length === 0) return false;
  const isParentBilling = sourceFile.fileName
    .replaceAll("\\", "/")
    .endsWith("e2e/portals/parent-billing.spec.ts");

  if (isParentBilling) {
    if (!hasValidParentBillingWrapper(sourceFile)) return false;
    return writes.every(({ valueExpression }) => {
      const wrapperCall = awaitedCall(valueExpression, "createParentSessionToken");
      return wrapperCall?.arguments.length === 0;
    });
  }

  return writes.every(({ valueExpression }) => {
    const directCall = awaitedCall(valueExpression, "createSessionToken");
    return directCall?.arguments.length === 1;
  });
}

function parseFixture(source: string, path = "e2e/portals/example.spec.ts") {
  return ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true);
}

const SHARED_IMPORT = `import { createSessionToken } from "@/e2e/helpers/session";`;
const DISCONNECTED_HELPER_CALL = `void createSessionToken({
  uid: "dead",
  role: UserRole.PARENT,
  email: "dead@example.com",
  fullName: "Dead call",
});`;

describe("session cookie source audit", () => {
  it.each([
    [
      "literal token with a disconnected shared-helper call",
      `${SHARED_IMPORT}
       ${DISCONNECTED_HELPER_CALL}
       context.addCookies([{ name: "ulu_session", value: "legacy-token" }]);`,
    ],
    [
      "non-awaited shared-helper token",
      `${SHARED_IMPORT}
       context.addCookies([{ name: "ulu_session", value: createSessionToken(input) }]);`,
    ],
    [
      "renamed local signer with a disconnected shared-helper call",
      `${SHARED_IMPORT}
       ${DISCONNECTED_HELPER_CALL}
       async function makeSessionToken() { return "legacy-token"; }
       context.addCookies([{ name: "ulu_session", value: await makeSessionToken() }]);`,
    ],
  ])("rejects %s", (_case, source) => {
    expect(callsSharedHelper(parseFixture(source))).toBe(false);
  });

  it("rejects a parent-billing wrapper with altered identity", () => {
    const source = `${SHARED_IMPORT}
      let parentEmail = "";
      let parentId = "";
      async function createParentSessionToken() {
        return await createSessionToken({
          email: parentEmail,
          fullName: "Changed Parent",
          mfaVerified: true,
          role: UserRole.PARENT,
          uid: parentId,
        });
      }
      context.addCookies([{
        name: "ulu_session",
        value: await createParentSessionToken(),
      }]);`;

    expect(callsSharedHelper(parseFixture(source, "e2e/portals/parent-billing.spec.ts"))).toBe(
      false,
    );
  });

  it("does not let parent-billing bypass its identity wrapper", () => {
    const source = `${SHARED_IMPORT}
      async function createParentSessionToken() {
        return await createSessionToken({
          email: "changed@example.com",
          fullName: "Changed Parent",
          mfaVerified: true,
          role: UserRole.PARENT,
          uid: "changed-parent",
        });
      }
      context.addCookies([{
        name: "ulu_session",
        value: await createSessionToken(input),
      }]);`;

    expect(callsSharedHelper(parseFixture(source, "e2e/portals/parent-billing.spec.ts"))).toBe(
      false,
    );
  });

  it("rejects a helper name shadowed by a local parameter", () => {
    const source = `${SHARED_IMPORT}
      async function setSession(createSessionToken: (input: unknown) => Promise<string>) {
        context.addCookies([{
          name: "ulu_session",
          value: await createSessionToken(input),
        }]);
      }`;

    expect(callsSharedHelper(parseFixture(source))).toBe(false);
  });
});

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
