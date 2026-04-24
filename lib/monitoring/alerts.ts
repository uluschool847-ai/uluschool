type AlertSeverity = "info" | "warning" | "critical";

export async function sendOpsAlert(input: {
  title: string;
  message: string;
  severity?: AlertSeverity;
  context?: Record<string, string | number | boolean | null | undefined>;
}) {
  const webhookUrl = process.env.ALERT_WEBHOOK_URL;
  if (!webhookUrl) {
    return { sent: false as const, reason: "ALERT_WEBHOOK_NOT_CONFIGURED" as const };
  }

  try {
    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        title: input.title,
        message: input.message,
        severity: input.severity || "warning",
        context: input.context || {},
        source: "ulu-online-school",
        timestamp: new Date().toISOString(),
      }),
      cache: "no-store",
    });

    if (!response.ok) {
      return { sent: false as const, reason: "ALERT_WEBHOOK_FAILED" as const };
    }

    return { sent: true as const };
  } catch {
    return { sent: false as const, reason: "ALERT_WEBHOOK_FAILED" as const };
  }
}
