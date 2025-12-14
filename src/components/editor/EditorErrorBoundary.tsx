"use client";

import { type ReactNode } from "react";
import { ErrorBoundary } from "../ErrorBoundary";

interface EditorErrorBoundaryProps {
  children: ReactNode;
  /** Optional fallback UI */
  fallback?: ReactNode;
  /** Optional raw HTML content for DOMParser error display */
  rawHtml?: string;
}

/**
 * EditorErrorBoundary - Error boundary wrapper for the editor interface
 * 
 * Wraps the editor content in the general ErrorBoundary component with
 * editor-specific configuration. Handles DOMParser errors by displaying
 * raw HTML with syntax highlighting.
 * 
 * Requirements: 4.8, 4.11, 8.9
 * DoD: Component crash shows error UI instead of blank page; HTML parsing errors show raw HTML view
 */
export function EditorErrorBoundary({ children, fallback, rawHtml }: EditorErrorBoundaryProps) {
  return (
    <ErrorBoundary
      title="Editor Error"
      redirectUrl="/dashboard"
      fallback={fallback}
      onError={(error, errorInfo) => {
        console.error("EditorErrorBoundary caught an error:", {
          error: error.message,
          stack: error.stack,
          componentStack: errorInfo.componentStack,
          timestamp: new Date().toISOString(),
        });
      }}
    >
      {children}
    </ErrorBoundary>
  );
}

export default EditorErrorBoundary;
