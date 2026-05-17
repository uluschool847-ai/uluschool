import { withSentryConfig } from "@sentry/nextjs";

/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverActions: {
      bodySizeLimit: "8mb",
    },
  },
};

export default withSentryConfig(nextConfig, {
  silent: !process.env.CI,
  tunnelRoute: "/monitoring",
});
