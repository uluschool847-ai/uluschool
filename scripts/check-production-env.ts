import { validateProductionEnv } from "../lib/config/production-env";

const result = validateProductionEnv(process.env);

if (result.ok) {
  if (result.skipped) {
    console.log("Production environment validation skipped for local development.");
  } else {
    console.log("Production environment validation passed.");
  }
} else {
  console.error("Production environment validation failed:");
  for (const error of result.errors) {
    console.error(`- ${error.key}: ${error.message}`);
  }
  process.exitCode = 1;
}
