/**
 * Run `build` or `dev` with `SKIP_ENV_VALIDATION` to skip env validation. This is especially useful
 * for Docker builds.
 */
import "./src/env.js";
import { withSentryConfig } from "@sentry/nextjs";

/**
 * Security headers configuration
 * @returns {Promise<import("next/dist/lib/load-custom-routes").Header[]>}
 */
async function headers() {
  // Common security headers applied to all routes
  const commonSecurityHeaders = [
    {
      key: "X-Content-Type-Options",
      value: "nosniff",
    },
    {
      key: "Referrer-Policy",
      value: "strict-origin-when-cross-origin",
    },
    {
      key: "Permissions-Policy",
      value: "camera=(), microphone=(), geolocation=()",
    },
  ];

  // Note: Next.js applies ALL matching headers, not just the first match.
  // So we need to be careful not to set conflicting X-Frame-Options.
  // We'll only set X-Frame-Options on specific routes that need it.
  return [
    {
      // Preview API route - allow framing from same origin (for dashboard thumbnails)
      source: "/api/project/:id/preview",
      headers: [
        ...commonSecurityHeaders,
        {
          key: "X-Frame-Options",
          value: "SAMEORIGIN",
        },
        {
          key: "Content-Security-Policy",
          value: "frame-ancestors 'self'",
        },
      ],
    },
    {
      // Public project pages - allow framing from same origin
      source: "/p/:path*",
      headers: [
        ...commonSecurityHeaders,
        {
          key: "X-Frame-Options",
          value: "SAMEORIGIN",
        },
      ],
    },
    {
      // Editor routes - no X-Frame-Options (allow framing for preview iframes)
      source: "/editor/:path*",
      headers: commonSecurityHeaders,
    },
    {
      // Dashboard - deny framing
      source: "/dashboard/:path*",
      headers: [
        ...commonSecurityHeaders,
        {
          key: "X-Frame-Options",
          value: "DENY",
        },
      ],
    },
    {
      // Auth pages - deny framing
      source: "/sign-in/:path*",
      headers: [
        ...commonSecurityHeaders,
        {
          key: "X-Frame-Options",
          value: "DENY",
        },
      ],
    },
    {
      // Auth pages - deny framing
      source: "/sign-up/:path*",
      headers: [
        ...commonSecurityHeaders,
        {
          key: "X-Frame-Options",
          value: "DENY",
        },
      ],
    },
    {
      // Pricing page - deny framing
      source: "/pricing/:path*",
      headers: [
        ...commonSecurityHeaders,
        {
          key: "X-Frame-Options",
          value: "DENY",
        },
      ],
    },
    {
      // Home page - deny framing
      source: "/",
      headers: [
        ...commonSecurityHeaders,
        {
          key: "X-Frame-Options",
          value: "DENY",
        },
      ],
    },
  ];
}

/**
 * Legacy URL redirects
 * Keeps old/broken links recoverable.
 */
async function redirects() {
  return [
    { source: "/auth/signin", destination: "/sign-in", permanent: false },
    { source: "/auth/signup", destination: "/sign-up", permanent: false },
    { source: "/login", destination: "/sign-in", permanent: false },
    { source: "/register", destination: "/sign-up", permanent: false },
    // Redirect /editor to /editor/new (handles edge cases)
    { source: "/editor", destination: "/editor/new", permanent: false },
  ];
}

/** @type {import("next").NextConfig} */
const config = {
  headers,
  redirects,
};

// Sentry configuration options
const sentryWebpackPluginOptions = {
  // For all available options, see:
  // https://github.com/getsentry/sentry-webpack-plugin#options

  // Suppresses source map uploading logs during build
  silent: true,
  
  // Upload source maps only in production
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  
  // Only upload source maps in production builds
  dryRun: process.env.NODE_ENV !== "production",
  
  // Hides source maps from generated client bundles
  hideSourceMaps: true,
  
  // Automatically tree-shake Sentry logger statements to reduce bundle size
  disableLogger: true,
};

// Wrap the config with Sentry
export default withSentryConfig(config, sentryWebpackPluginOptions);
