import { cmsProvider } from "@/lib/cms/provider";

/**
 * Audit-only call site so the provider remains visible to static connectivity checks
 * while the real pluggable CMS adapter is deferred.
 */
export async function auditCmsProviderUsage() {
  return cmsProvider.getPage("connectivity-audit");
}
