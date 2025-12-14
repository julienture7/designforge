/**
 * Next.js Instrumentation File
 * 
 * This file is used to initialize Sentry on the server and edge runtimes.
 * https://nextjs.org/docs/app/building-your-application/optimizing/instrumentation
 * 
 * Requirements: 10.1, 10.2, 10.6
 */

import * as Sentry from "@sentry/nextjs";

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    // Server-side Sentry initialization
    Sentry.init({
      dsn: process.env.SENTRY_DSN,
      
      // Adjust this value in production, or use tracesSampler for greater control
      tracesSampleRate: 1.0,
      
      // Setting this option to true will print useful information to the console while you're setting up Sentry.
      debug: false,
      
      // Environment tag for filtering in Sentry dashboard
      environment: process.env.NODE_ENV,
      
      // Filter out sensitive data before sending to Sentry
      beforeSend(event) {
        // Sanitize request body
        if (event.request?.data) {
          event.request.data = "[REDACTED]";
        }
        
        // Sanitize cookies
        if (event.request?.cookies) {
          event.request.cookies = {};
        }
        
        // Sanitize headers that might contain auth tokens
        if (event.request?.headers) {
          const sensitiveHeaders = ["authorization", "cookie", "x-auth-token", "x-api-key"];
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
  }

  if (process.env.NEXT_RUNTIME === "edge") {
    // Edge runtime Sentry initialization
    Sentry.init({
      dsn: process.env.SENTRY_DSN,
      
      // Adjust this value in production, or use tracesSampler for greater control
      tracesSampleRate: 1.0,
      
      // Setting this option to true will print useful information to the console while you're setting up Sentry.
      debug: false,
      
      // Environment tag for filtering in Sentry dashboard
      environment: process.env.NODE_ENV,
      
      // Only enable in production
      enabled: process.env.NODE_ENV === "production",
    });
  }
}

/**
 * Captures errors from nested React Server Components
 * https://docs.sentry.io/platforms/javascript/guides/nextjs/manual-setup/#errors-from-nested-react-server-components
 */
export const onRequestError = Sentry.captureRequestError;
