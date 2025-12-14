/**
 * Error Tracking Service
 * 
 * Provides centralized error tracking with Sentry integration and fallback to console.error.
 * Captures unhandled exceptions with full context: correlationId, userId, request path, sanitized request body.
 * 
 * Requirements: 10.1, 10.2, 10.6
 */

import * as Sentry from "@sentry/nextjs";

export interface ErrorContext {
  correlationId: string;
  userId?: string;
  requestPath?: string;
  requestBody?: Record<string, unknown>;
  additionalContext?: Record<string, unknown>;
}

/**
 * Sanitizes request body by removing sensitive fields
 */
function sanitizeRequestBody(body: Record<string, unknown> | undefined): Record<string, unknown> | undefined {
  if (!body) return undefined;
  
  const sensitiveFields = [
    "password",
    "token",
    "secret",
    "apiKey",
    "api_key",
    "authorization",
    "creditCard",
    "credit_card",
    "ssn",
    "socialSecurityNumber",
  ];
  
  const sanitized: Record<string, unknown> = {};
  
  for (const [key, value] of Object.entries(body)) {
    const lowerKey = key.toLowerCase();
    if (sensitiveFields.some(field => lowerKey.includes(field.toLowerCase()))) {
      sanitized[key] = "[REDACTED]";
    } else if (typeof value === "object" && value !== null && !Array.isArray(value)) {
      sanitized[key] = sanitizeRequestBody(value as Record<string, unknown>);
    } else {
      sanitized[key] = value;
    }
  }
  
  return sanitized;
}

/**
 * Formats error context for structured JSON logging
 */
function formatStructuredLog(error: Error, context: ErrorContext): string {
  const logEntry = {
    timestamp: new Date().toISOString(),
    level: "error",
    correlationId: context.correlationId,
    userId: context.userId ?? null,
    requestPath: context.requestPath ?? null,
    requestBody: sanitizeRequestBody(context.requestBody),
    error: {
      name: error.name,
      message: error.message,
      stack: error.stack,
    },
    additionalContext: context.additionalContext ?? null,
  };
  
  return JSON.stringify(logEntry, null, 2);
}

/**
 * Checks if Sentry is available and properly configured
 */
function isSentryAvailable(): boolean {
  try {
    const client = Sentry.getClient();
    return client !== undefined && client.getDsn() !== undefined;
  } catch {
    return false;
  }
}

/**
 * Captures an exception with full context
 * Falls back to console.error with structured JSON if Sentry is unreachable
 * 
 * @param error - The error to capture
 * @param context - Additional context including correlationId, userId, requestPath, requestBody
 */
export function captureException(error: Error, context: ErrorContext): void {
  const sanitizedBody = sanitizeRequestBody(context.requestBody);
  
  // Try Sentry first
  if (isSentryAvailable()) {
    try {
      Sentry.withScope((scope) => {
        // Set tags for filtering in Sentry dashboard
        scope.setTag("correlationId", context.correlationId);
        if (context.userId) {
          scope.setUser({ id: context.userId });
        }
        if (context.requestPath) {
          scope.setTag("requestPath", context.requestPath);
        }
        
        // Set extra context
        scope.setExtra("correlationId", context.correlationId);
        scope.setExtra("requestPath", context.requestPath);
        scope.setExtra("requestBody", sanitizedBody);
        if (context.additionalContext) {
          scope.setExtras(context.additionalContext);
        }
        
        Sentry.captureException(error);
      });
      return;
    } catch (sentryError) {
      // Sentry failed, fall through to console fallback
      console.error("[Sentry Error] Failed to send to Sentry:", sentryError);
    }
  }
  
  // Fallback to console.error with structured JSON
  console.error("[Error Tracker Fallback]", formatStructuredLog(error, context));
}

/**
 * Captures a message with context (for non-exception events)
 * Falls back to console.error with structured JSON if Sentry is unreachable
 * 
 * @param message - The message to capture
 * @param level - Severity level
 * @param context - Additional context
 */
export function captureMessage(
  message: string,
  level: "fatal" | "error" | "warning" | "info" | "debug" = "info",
  context: Partial<ErrorContext> = {}
): void {
  const sanitizedBody = sanitizeRequestBody(context.requestBody);
  
  // Try Sentry first
  if (isSentryAvailable()) {
    try {
      Sentry.withScope((scope) => {
        if (context.correlationId) {
          scope.setTag("correlationId", context.correlationId);
        }
        if (context.userId) {
          scope.setUser({ id: context.userId });
        }
        if (context.requestPath) {
          scope.setTag("requestPath", context.requestPath);
        }
        
        scope.setExtra("requestBody", sanitizedBody);
        if (context.additionalContext) {
          scope.setExtras(context.additionalContext);
        }
        
        Sentry.captureMessage(message, level);
      });
      return;
    } catch (sentryError) {
      console.error("[Sentry Error] Failed to send to Sentry:", sentryError);
    }
  }
  
  // Fallback to console with structured JSON
  const logEntry = {
    timestamp: new Date().toISOString(),
    level,
    message,
    correlationId: context.correlationId ?? null,
    userId: context.userId ?? null,
    requestPath: context.requestPath ?? null,
    requestBody: sanitizedBody,
    additionalContext: context.additionalContext ?? null,
  };
  
  const logMethod = level === "error" || level === "fatal" ? console.error : console.log;
  logMethod("[Error Tracker Fallback]", JSON.stringify(logEntry, null, 2));
}

/**
 * Sets user context for all subsequent Sentry events
 * 
 * @param userId - The user ID to set
 * @param additionalData - Additional user data (email, username, etc.)
 */
export function setUser(userId: string, additionalData?: Record<string, string>): void {
  if (isSentryAvailable()) {
    Sentry.setUser({
      id: userId,
      ...additionalData,
    });
  }
}

/**
 * Clears user context (e.g., on logout)
 */
export function clearUser(): void {
  if (isSentryAvailable()) {
    Sentry.setUser(null);
  }
}

/**
 * Adds a breadcrumb for debugging context
 * 
 * @param message - Breadcrumb message
 * @param category - Category for grouping
 * @param data - Additional data
 */
export function addBreadcrumb(
  message: string,
  category: string,
  data?: Record<string, unknown>
): void {
  if (isSentryAvailable()) {
    Sentry.addBreadcrumb({
      message,
      category,
      data,
      level: "info",
    });
  }
}

/**
 * Generates a unique correlation ID for request tracing
 */
export function generateCorrelationId(): string {
  return crypto.randomUUID();
}
