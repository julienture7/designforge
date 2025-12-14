"use client";

import { ErrorBoundary } from "../ErrorBoundary";
import type { ReactNode } from "react";

interface DashboardErrorBoundaryProps {
  children: ReactNode;
}

/**
 * DashboardErrorBoundary - Error boundary wrapper for the Dashboard
 * 
 * Wraps the dashboard content in an error boundary with dashboard-specific
 * configuration (redirect to home page, dashboard-specific title).
 * 
 * Requirements: 8.9
 */
export function DashboardErrorBoundary({ children }: DashboardErrorBoundaryProps) {
  return (
    <ErrorBoundary
      title="Dashboard Error"
      redirectUrl="/"
      onError={(error, errorInfo) => {
        console.error("Dashboard error:", {
          error: error.message,
          componentStack: errorInfo.componentStack,
          timestamp: new Date().toISOString(),
        });
      }}
    >
      {children}
    </ErrorBoundary>
  );
}

export default DashboardErrorBoundary;
