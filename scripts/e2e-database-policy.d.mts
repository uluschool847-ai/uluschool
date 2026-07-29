export type E2EEnvironment = Record<string, string | undefined>;

export type ResolvedE2EEnvironment = E2EEnvironment & {
  DATABASE_URL: string;
  DIRECT_URL: string;
  E2E_DATABASE_RESET_ALLOWED: string;
  E2E_DATABASE_URL: string;
  E2E_DIRECT_URL: string;
};

export type E2EPreparationResult = {
  status: number | null;
  stderr?: string;
};

export type E2EPreparationExecutor = (
  step: string[],
  environment: E2EEnvironment,
) => E2EPreparationResult;

export function loadProjectEnvironment(
  environment: E2EEnvironment,
  projectDirectory?: string,
): E2EEnvironment;

export function resolveE2EDatabaseEnvironment(environment: E2EEnvironment): ResolvedE2EEnvironment;

export function resolveNpmCliPath(
  environment: E2EEnvironment,
  nodeExecutable?: string,
  fileExists?: (path: string) => boolean,
): string;

export function prepareE2EDatabase(
  environment: E2EEnvironment,
  execute?: E2EPreparationExecutor,
): ResolvedE2EEnvironment;
