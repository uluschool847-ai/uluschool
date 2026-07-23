import { readFileSync, readdirSync } from "node:fs";
import { isAbsolute, join, relative, resolve } from "node:path";
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
const VIRTUAL_HELPER_PATH = join(ROOT, "e2e", "helpers", "session.ts");
const VIRTUAL_HELPER_SOURCE = `
  export declare function createSessionToken(input: unknown): Promise<string>;
`;

type AuditSourceInput = {
  path: string;
  source: string;
};

type AuditSource = {
  checker: ts.TypeChecker;
  path: string;
  sourceFile: ts.SourceFile;
};

function normalizeFilePath(path: string) {
  return path.replaceAll("\\", "/").toLowerCase();
}

function createAuditSources(inputs: AuditSourceInput[]): AuditSource[] {
  const entries = inputs.map((input) => {
    const absolutePath = isAbsolute(input.path) ? input.path : resolve(ROOT, input.path);
    return {
      absolutePath,
      displayPath: relative(ROOT, absolutePath).replaceAll("\\", "/"),
      sourceFile: ts.createSourceFile(absolutePath, input.source, ts.ScriptTarget.Latest, true),
    };
  });
  const helperSourceFile = ts.createSourceFile(
    VIRTUAL_HELPER_PATH,
    VIRTUAL_HELPER_SOURCE,
    ts.ScriptTarget.Latest,
    true,
  );
  const sourceFiles = new Map<string, ts.SourceFile>([
    [normalizeFilePath(VIRTUAL_HELPER_PATH), helperSourceFile],
    ...entries.map((entry) => [normalizeFilePath(entry.absolutePath), entry.sourceFile] as const),
  ]);
  const options: ts.CompilerOptions = {
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    noEmit: true,
    noLib: true,
    target: ts.ScriptTarget.ESNext,
  };
  const defaultHost = ts.createCompilerHost(options, true);
  const host: ts.CompilerHost = {
    ...defaultHost,
    fileExists: (fileName) => sourceFiles.has(normalizeFilePath(fileName)),
    getSourceFile: (fileName) => sourceFiles.get(normalizeFilePath(fileName)),
    readFile: (fileName) => sourceFiles.get(normalizeFilePath(fileName))?.text,
    writeFile: () => undefined,
  };
  host.resolveModuleNames = (moduleNames) =>
    moduleNames.map((moduleName) =>
      moduleName === SHARED_HELPER_IMPORT
        ? {
            extension: ts.Extension.Ts,
            isExternalLibraryImport: false,
            resolvedFileName: VIRTUAL_HELPER_PATH,
          }
        : undefined,
    );
  const program = ts.createProgram({
    host,
    options,
    rootNames: [...entries.map((entry) => entry.absolutePath), VIRTUAL_HELPER_PATH],
  });
  const checker = program.getTypeChecker();

  return entries.map((entry) => ({
    checker,
    path: entry.displayPath,
    sourceFile: program.getSourceFile(entry.absolutePath) ?? entry.sourceFile,
  }));
}

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

function bindingContainsIdentifier(name: ts.BindingName, identifier: string): boolean {
  if (ts.isIdentifier(name)) return name.text === identifier;
  return name.elements.some(
    (element) =>
      !ts.isOmittedExpression(element) && bindingContainsIdentifier(element.name, identifier),
  );
}

function hasLocalCreateSessionToken(sourceFile: ts.SourceFile) {
  let found = false;
  const visit = (node: ts.Node) => {
    if (
      ((ts.isFunctionDeclaration(node) || ts.isFunctionExpression(node)) &&
        node.name?.text === "createSessionToken") ||
      ((ts.isVariableDeclaration(node) || ts.isParameter(node)) &&
        bindingContainsIdentifier(node.name, "createSessionToken"))
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

function sharedHelperImportSymbol(auditSource: AuditSource) {
  const { checker, sourceFile } = auditSource;
  for (const statement of sourceFile.statements) {
    if (
      !ts.isImportDeclaration(statement) ||
      !ts.isStringLiteral(statement.moduleSpecifier) ||
      statement.moduleSpecifier.text !== SHARED_HELPER_IMPORT ||
      !statement.importClause?.namedBindings ||
      !ts.isNamedImports(statement.importClause.namedBindings)
    ) {
      continue;
    }
    const importSpecifier = statement.importClause.namedBindings.elements.find(
      (element) =>
        (element.propertyName?.text ?? element.name.text) === "createSessionToken" &&
        element.name.text === "createSessionToken",
    );
    if (importSpecifier) return checker.getSymbolAtLocation(importSpecifier.name);
  }
  return undefined;
}

function importsSharedHelper(auditSource: AuditSource) {
  return Boolean(sharedHelperImportSymbol(auditSource));
}

function resolvedSymbol(checker: ts.TypeChecker, symbol: ts.Symbol) {
  return symbol.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(symbol) : symbol;
}

function identifierResolvesTo(
  checker: ts.TypeChecker,
  identifier: ts.Identifier,
  expected: ts.Symbol,
) {
  const actual = checker.getSymbolAtLocation(identifier);
  return Boolean(actual && resolvedSymbol(checker, actual) === resolvedSymbol(checker, expected));
}

function awaitedCall(
  expression: ts.Expression | undefined,
  expected: ts.Symbol,
  checker: ts.TypeChecker,
) {
  if (!expression || !ts.isAwaitExpression(expression)) return undefined;
  const call = expression.expression;
  return ts.isCallExpression(call) &&
    ts.isIdentifier(call.expression) &&
    identifierResolvesTo(checker, call.expression, expected)
    ? call
    : undefined;
}

function topLevelFunctionSymbol(sourceFile: ts.SourceFile, checker: ts.TypeChecker, name: string) {
  const declaration = sourceFile.statements.find(
    (statement): statement is ts.FunctionDeclaration =>
      ts.isFunctionDeclaration(statement) && statement.name?.text === name,
  );
  return declaration?.name
    ? { declaration, symbol: checker.getSymbolAtLocation(declaration.name) }
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
  if (object.properties.length !== 4) return false;
  const email = propertyAssignment(object, "email")?.initializer;
  const fullName = propertyAssignment(object, "fullName")?.initializer;
  const role = propertyAssignment(object, "role")?.initializer;
  const uid = propertyAssignment(object, "uid")?.initializer;

  return Boolean(
    email &&
      isIdentifier(email, "parentEmail") &&
      fullName &&
      ts.isStringLiteral(fullName) &&
      fullName.text === "QA Parent Billing" &&
      role &&
      isParentRole(role) &&
      uid &&
      isIdentifier(uid, "parentId"),
  );
}

function validParentBillingWrapperSymbol(auditSource: AuditSource, helperSymbol: ts.Symbol) {
  const { checker, sourceFile } = auditSource;
  const wrapperBinding = topLevelFunctionSymbol(sourceFile, checker, "createParentSessionToken");
  const wrapper = wrapperBinding?.declaration;
  if (
    !wrapper?.body ||
    !wrapperBinding.symbol ||
    wrapper.parameters.length !== 0 ||
    !wrapper.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.AsyncKeyword) ||
    wrapper.body.statements.length !== 1
  ) {
    return undefined;
  }

  const returnStatement = wrapper.body.statements[0];
  if (!ts.isReturnStatement(returnStatement)) return undefined;
  const helperCall = awaitedCall(returnStatement.expression, helperSymbol, checker);
  return helperCall &&
    helperCall.arguments.length === 1 &&
    ts.isObjectLiteralExpression(helperCall.arguments[0]) &&
    hasPreservedParentBillingIdentity(helperCall.arguments[0])
    ? wrapperBinding.symbol
    : undefined;
}

function callsSharedHelper(auditSource: AuditSource) {
  const { checker, sourceFile } = auditSource;
  const helperSymbol = sharedHelperImportSymbol(auditSource);
  if (!helperSymbol || hasLocalCreateSessionToken(sourceFile)) return false;
  const writes = cookieWrites(sourceFile);
  if (writes.length === 0) return false;
  const isParentBilling = sourceFile.fileName
    .replaceAll("\\", "/")
    .endsWith("e2e/portals/parent-billing.spec.ts");

  if (isParentBilling) {
    const wrapperSymbol = validParentBillingWrapperSymbol(auditSource, helperSymbol);
    if (!wrapperSymbol) return false;
    return writes.every(({ valueExpression }) => {
      const wrapperCall = awaitedCall(valueExpression, wrapperSymbol, checker);
      return wrapperCall?.arguments.length === 0;
    });
  }

  return writes.every(({ valueExpression }) => {
    const directCall = awaitedCall(valueExpression, helperSymbol, checker);
    return directCall?.arguments.length === 1;
  });
}

function parseFixture(source: string, path = "e2e/portals/example.spec.ts") {
  const auditSource = createAuditSources([{ path, source }])[0];
  if (!auditSource) throw new Error(`Failed to create audit source for ${path}`);
  return auditSource;
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

  it("rejects the imported helper shadowed by a destructured parameter", () => {
    const source = `${SHARED_IMPORT}
      async function setSession({ createSessionToken }: {
        createSessionToken: (input: unknown) => Promise<string>;
      }) {
        context.addCookies([{
          name: "ulu_session",
          value: await createSessionToken(input),
        }]);
      }`;

    expect(callsSharedHelper(parseFixture(source))).toBe(false);
  });

  it("rejects a nested binding shadowing the validated parent-billing wrapper", () => {
    const source = `${SHARED_IMPORT}
      let parentEmail = "";
      let parentId = "";
      async function createParentSessionToken() {
        return await createSessionToken({
          email: parentEmail,
          fullName: "QA Parent Billing",
          role: UserRole.PARENT,
          uid: parentId,
        });
      }
      async function setSession(source: {
        createParentSessionToken: () => Promise<string>;
      }) {
        const { createParentSessionToken } = source;
        context.addCookies([{
          name: "ulu_session",
          value: await createParentSessionToken(),
        }]);
      }`;

    expect(callsSharedHelper(parseFixture(source, "e2e/portals/parent-billing.spec.ts"))).toBe(
      false,
    );
  });
});

describe("Playwright ulu_session fixture inventory", () => {
  it("uses the shared purpose-bound helper for every signed session cookie write", () => {
    const specs = createAuditSources(
      walk(E2E_ROOT).map((path) => ({
        path,
        source: readFileSync(path, "utf8"),
      })),
    );
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
      (auditSource) => !importsSharedHelper(auditSource) || !callsSharedHelper(auditSource),
    );

    expect(localSigners.map(({ path }) => path)).toEqual([]);
    expect(localHmac.map(({ path }) => path)).toEqual([]);
    expect(missingSharedHelper.map(({ path }) => path)).toEqual([]);
  });
});
