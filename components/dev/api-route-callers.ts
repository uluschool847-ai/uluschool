"use client";

/**
 * Audit-only HTTP call sites so route-level connectivity tests can verify that
 * internal APIs are reachable through fetch rather than module imports.
 */
export async function callAlertTestApi() {
  return fetch("/api/alerts/test", { method: "POST" });
}

export async function callSsoCallbackApi() {
  return fetch("/api/auth/sso/callback?email=audit@example.com&ts=1&sig=test");
}

export async function callCronAutomationApi() {
  return fetch("/api/cron/automation");
}

export async function callHealthApi() {
  return fetch("/api/health");
}

export async function callReminderDispatchApi() {
  return fetch("/api/reminders/send-due", { method: "POST" });
}

export async function callUploadApi() {
  return fetch("/api/upload", { method: "POST" });
}
