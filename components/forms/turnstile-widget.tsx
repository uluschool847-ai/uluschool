"use client";

import Script from "next/script";

const turnstileSiteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;

export function TurnstileWidget() {
  if (!turnstileSiteKey) {
    return null;
  }

  return (
    <div className="space-y-2">
      <Script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer />
      <div className="cf-turnstile" data-sitekey={turnstileSiteKey} data-theme="auto" />
      <p className="text-xs text-muted-foreground">
        Protected by Turnstile anti-spam verification.
      </p>
    </div>
  );
}
