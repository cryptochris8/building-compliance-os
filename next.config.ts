import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

// Security headers are now applied via middleware (src/middleware.ts)
// to support per-request CSP nonces.
const nextConfig: NextConfig = {};

export default withSentryConfig(nextConfig, {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  silent: !process.env.CI,
  widenClientFileUpload: true,
  disableLogger: true,
  automaticVercelMonitors: true,
});
