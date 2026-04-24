"use client";

import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";

import { Button } from "@/components/ui/button";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html lang="en">
      <body className="min-h-screen bg-background text-foreground">
        <main className="container py-16">
          <h1 className="text-3xl font-semibold">Something went wrong</h1>
          <p className="mt-3 max-w-2xl text-sm text-muted-foreground">
            The incident has been logged. Please try reloading the page.
          </p>
          <div className="mt-6">
            <Button onClick={reset}>Try again</Button>
          </div>
        </main>
      </body>
    </html>
  );
}
