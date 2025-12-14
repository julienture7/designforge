"use client";

/**
 * Global Error Handler for React Rendering Errors
 * 
 * This file catches React rendering errors in the App Router and reports them to Sentry.
 * https://nextjs.org/docs/app/building-your-application/routing/error-handling#handling-errors-in-root-layouts
 * 
 * Requirements: 10.1, 10.2, 10.6
 */

import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Report the error to Sentry
    Sentry.captureException(error, {
      tags: {
        errorType: "react_render_error",
        digest: error.digest,
      },
    });
  }, [error]);

  return (
    <html>
      <body>
        <div style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          minHeight: "100vh",
          padding: "2rem",
          fontFamily: "system-ui, -apple-system, sans-serif",
          backgroundColor: "#0a0a0a",
          color: "#ededed",
        }}>
          <h1 style={{ fontSize: "2rem", marginBottom: "1rem" }}>
            Something went wrong!
          </h1>
          <p style={{ 
            color: "#888", 
            marginBottom: "2rem",
            textAlign: "center",
            maxWidth: "400px",
          }}>
            We apologize for the inconvenience. An error has occurred and our team has been notified.
          </p>
          {error.digest && (
            <p style={{ 
              color: "#666", 
              fontSize: "0.875rem",
              marginBottom: "1rem",
            }}>
              Error ID: {error.digest}
            </p>
          )}
          <button
            onClick={() => reset()}
            style={{
              padding: "0.75rem 1.5rem",
              backgroundColor: "#3b82f6",
              color: "white",
              border: "none",
              borderRadius: "0.5rem",
              cursor: "pointer",
              fontSize: "1rem",
              fontWeight: 500,
            }}
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
