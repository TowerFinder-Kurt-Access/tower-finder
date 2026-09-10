import { withSentryConfig } from '@sentry/nextjs';

/** @type {import('next').NextConfig} */
const nextConfig = {
  outputFileTracingExcludes: {
    '*': [
      '**/*.map',
      '**/__tests__/**',
      '**/*.test.*',
      '**/*.spec.*',
      '**/.local-browsers/**',
    ],
  },
};

export default withSentryConfig(nextConfig, {
  silent: true,
  hideSourceMaps: true,
  widenClientFileUpload: false,
  disableLogger: true,
});
