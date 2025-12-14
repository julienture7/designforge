/**
 * Next.js Client Instrumentation File
 * 
 * This file is used to initialize Sentry on the client.
 * https://nextjs.org/docs/app/api-reference/file-conventions/instrumentation-client
 * 
 * Requirements: 10.1, 10.2, 10.6
 */

import * as Sentry from "@sentry/nextjs";

const SENTRY_DSN = process.env.NEXT_PUBLIC_SENTRY_DSN;

Sentry.init({
  dsn: SENTRY_DSN,

  // Adjust this value in production, or use tracesSampler for greater control
  tracesSampleRate: 1.0,

  // Setting this option to true will print useful information to the console while you're setting up Sentry.
  debug: false,

  // Enable replay only in production
  replaysOnErrorSampleRate: 1.0,
  replaysSessionSampleRate: 0.1,

  // You can remove this option if you're not planning to use the Sentry Session Replay feature:
  integrations: [
    Sentry.replayIntegration({
      // Additional Replay configuration goes in here
      maskAllText: true,
      blockAllMedia: true,
    }),
  ],

  // Filter out sensitive data before sending to Sentry
  beforeSend(event) {
    // Sanitize request data
    if (event.request?.data) {
      event.request.data = "[REDACTED]";
    }
    
    // Sanitize cookies
    if (event.request?.cookies) {
      event.request.cookies = {};
    }
    
    // Sanitize headers that might contain auth tokens
    if (event.request?.headers) {
      const sensitiveHeaders = ["authorization", "cookie", "x-auth-token"];
      for (const header of sensitiveHeaders) {
        if (event.request.headers[header]) {
          event.request.headers[header] = "[REDACTED]";
        }
      }
    }
    
    return event;
  },

  // Only enable in production
  enabled: process.env.NODE_ENV === "production",
});
