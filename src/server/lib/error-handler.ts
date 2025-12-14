/**
 * Global Error Handler
 * 
 * Provides centralized error handling for the application.
 * - Generates correlationId for each error
 * - Logs full stack trace to structured logger and Sentry
 * - Returns sanitized error to client (no stack trace exposed)
 * 
 * Requirements: 8.9
 */

import { TRPCError } from "@trpc/server";
import { generateCorrelationId, logError } from "./logger";
import { captureException, type ErrorContext } from "@/lib/utils/error-tracker";

/**
 * Error codes as defined in the Global Error Dictionary
 */
export type ErrorCode =
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "VALIDATION_ERROR"
  | "EMPTY_PROMPT"
  | "PROMPT_TOO_LONG"
  | "INVALID_QUERY"
  | "CREDITS_EXHAUSTED"
  | "GENERATION_IN_PROGRESS"
  | "CONFLICT"
  | "RATE_LIMITED"
  | "AI_SERVICE_BUSY"
  | "AI_SERVICE_UNAVAILABLE"
  | "STREAM_INTERRUPTED"
  | "INTERNAL_ERROR"
  | "PROJECT_NOT_FOUND"
  | "TOKEN_LIMIT_EXCEEDED"
  | "WEBHOOK_INVALID_SIGNATURE";

/**
 * HTTP status codes mapped to error codes
 */
export const ERROR_STATUS_MAP: Record<ErrorCode, number> = {
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  VALIDATION_ERROR: 400,
  EMPTY_PROMPT: 400,
  PROMPT_TOO_LONG: 400,
  INVALID_QUERY: 400,
  CREDITS_EXHAUSTED: 402,
  GENERATION_IN_PROGRESS: 409,
  CONFLICT: 409,
  RATE_LIMITED: 429,
  AI_SERVICE_BUSY: 429,
  AI_SERVICE_UNAVAILABLE: 503,
  STREAM_INTERRUPTED: 500,
  INTERNAL_ERROR: 500,
  PROJECT_NOT_FOUND: 404,
  TOKEN_LIMIT_EXCEEDED: 200,
  WEBHOOK_INVALID_SIGNATURE: 400,
};

/**
 * User-friendly error messages
 */
export const ERROR_MESSAGES: Record<ErrorCode, string> = {
  UNAUTHORIZED: "Please sign in to continue",
  FORBIDDEN: "You don't have permission to access this resource",
  VALIDATION_ERROR: "Invalid request",
  EMPTY_PROMPT: "Please enter a description for your interface",
  PROMPT_TOO_LONG: "Your description is too long. Please keep it under 10,000 characters",
  INVALID_QUERY: "Invalid image search query",
  CREDITS_EXHAUSTED: "You've used all your free generations today. Upgrade to Pro for unlimited access",
  GENERATION_IN_PROGRESS: "Please wait for your current generation to complete",
  CONFLICT: "Request conflict. Please try again",
  RATE_LIMITED: "Too many requests. Please wait a moment",
  AI_SERVICE_BUSY: "AI service is busy. Please try again in a moment",
  AI_SERVICE_UNAVAILABLE: "AI service is temporarily unavailable. Please try again later",
  STREAM_INTERRUPTED: "Generation was interrupted. Click 'Resume' to continue",
  INTERNAL_ERROR: "Something went wrong. Please try again",
  PROJECT_NOT_FOUND: "Project not found",
  TOKEN_LIMIT_EXCEEDED: "Generation reached maximum length. You can continue from where it stopped",
  WEBHOOK_INVALID_SIGNATURE: "Invalid webhook signature",
};

/**
 * Standardized API error response structure
 */
export interface ApiErrorResponse {
  success: false;
  error: {
    code: ErrorCode;
    message: string;
    details?: Record<string, string>[];
    correlationId: string;
  };
}

/**
 * Standardized API success response structure
 */
export interface ApiSuccessResponse<T> {
  success: true;
  data: T;
  meta?: {
    pagination?: { page: number; pageSize: number; total: number };
    rateLimit?: { remaining: number; resetAt: string };
  };
}

export type ApiResponse<T> = ApiSuccessResponse<T> | ApiErrorResponse;

/**
 * Options for handling errors
 */
export interface ErrorHandlerOptions {
  userId?: string;
  requestPath?: string;
  requestBody?: Record<string, unknown>;
  additionalContext?: Record<string, unknown>;
}

/**
 * Result of handling an error
 */
export interface HandledError {
  correlationId: string;
  code: ErrorCode;
  message: string;
  statusCode: number;
  details?: Record<string, string>[];
}

/**
 * Determines if an error is a known application error
 */
function isKnownErrorCode(code: string): code is ErrorCode {
  return code in ERROR_STATUS_MAP;
}

/**
 * Extracts error code from TRPCError or other error types
 */
function extractErrorCode(error: unknown): ErrorCode | null {
  if (error instanceof TRPCError) {
    // Check if the message contains a JSON-encoded error
    try {
      const parsed = JSON.parse(error.message) as { code?: string };
      if (parsed.code && isKnownErrorCode(parsed.code)) {
        return parsed.code;
      }
    } catch {
      // Not JSON, check the code directly
    }
    
    // Map TRPC error codes to our error codes
    switch (error.code) {
      case "UNAUTHORIZED":
        return "UNAUTHORIZED";
      case "FORBIDDEN":
        return "FORBIDDEN";
      case "NOT_FOUND":
        return "PROJECT_NOT_FOUND";
      case "BAD_REQUEST":
        return "VALIDATION_ERROR";
      case "CONFLICT":
        return "CONFLICT";
      case "TOO_MANY_REQUESTS":
        return "RATE_LIMITED";
      default:
        return null;
    }
  }
  
  // Check if error has a code property
  if (error && typeof error === "object" && "code" in error) {
    const code = (error as { code: unknown }).code;
    if (typeof code === "string" && isKnownErrorCode(code)) {
      return code;
    }
  }
  
  return null;
}

/**
 * Handles an error by logging it and returning a sanitized response
 * 
 * This function:
 * 1. Generates a correlationId for tracking
 * 2. Logs the full error with stack trace to the structured logger
 * 3. Sends the error to Sentry with full context
 * 4. Returns a sanitized error response without exposing internal details
 * 
 * @param error - The error to handle
 * @param options - Additional context for logging
 * @returns A sanitized error response safe for client consumption
 */
export function handleError(
  error: unknown,
  options: ErrorHandlerOptions = {}
): HandledError {
  const correlationId = generateCorrelationId();
  
  // Extract error details
  const errorInstance = error instanceof Error ? error : new Error(String(error));
  const knownCode = extractErrorCode(error);
  const code: ErrorCode = knownCode ?? "INTERNAL_ERROR";
  const statusCode = ERROR_STATUS_MAP[code];
  
  // Build error context for logging
  const errorContext: ErrorContext = {
    correlationId,
    userId: options.userId,
    requestPath: options.requestPath,
    requestBody: options.requestBody,
    additionalContext: {
      ...options.additionalContext,
      errorCode: code,
      originalError: errorInstance.name,
    },
  };
  
  // Log full error with stack trace to structured logger
  logError(
    correlationId,
    `Error handled: ${code}`,
    errorInstance,
    {
      userId: options.userId,
      requestPath: options.requestPath,
      errorCode: code,
      statusCode,
    }
  );
  
  // Send to Sentry with full context
  captureException(errorInstance, errorContext);
  
  // Build user-friendly message
  let message = ERROR_MESSAGES[code];
  
  // For INTERNAL_ERROR, append correlationId for support reference
  if (code === "INTERNAL_ERROR") {
    message = `${message} (Error ID: ${correlationId})`;
  }
  
  // Extract validation details if available
  let details: Record<string, string>[] | undefined;
  if (code === "VALIDATION_ERROR" && error instanceof TRPCError) {
    try {
      const parsed = JSON.parse(error.message) as { details?: Record<string, string>[] };
      if (parsed.details) {
        // Sanitize details to only include first-level field names
        details = parsed.details.map((d) => ({
          field: d.field?.split(".")[0] ?? "unknown",
          message: d.message ?? "Invalid value",
        }));
      }
    } catch {
      // Ignore parsing errors
    }
  }
  
  return {
    correlationId,
    code,
    message,
    statusCode,
    details,
  };
}

/**
 * Creates a standardized API error response
 * 
 * @param handledError - The result from handleError
 * @returns A Response object with the error
 */
export function createErrorResponse(handledError: HandledError): Response {
  const body: ApiErrorResponse = {
    success: false,
    error: {
      code: handledError.code,
      message: handledError.message,
      correlationId: handledError.correlationId,
      details: handledError.details,
    },
  };
  
  return Response.json(body, { status: handledError.statusCode });
}

/**
 * Creates a standardized API success response
 * 
 * @param data - The response data
 * @param meta - Optional metadata (pagination, rate limit info)
 * @returns A Response object with the success data
 */
export function createSuccessResponse<T>(
  data: T,
  meta?: ApiSuccessResponse<T>["meta"]
): Response {
  const body: ApiSuccessResponse<T> = {
    success: true,
    data,
    meta,
  };
  
  return Response.json(body, { status: 200 });
}

/**
 * Creates an application error with a specific code
 * 
 * @param code - The error code
 * @param details - Optional validation details
 * @returns An Error object with the code attached
 */
export function createAppError(
  code: ErrorCode,
  details?: Record<string, string>[]
): Error {
  const error = new Error(ERROR_MESSAGES[code]);
  (error as Error & { code: ErrorCode }).code = code;
  if (details) {
    (error as Error & { details: Record<string, string>[] }).details = details;
  }
  return error;
}

/**
 * Wraps an async handler with error handling
 * 
 * @param handler - The async handler function
 * @param options - Error handler options
 * @returns A wrapped handler that catches and handles errors
 */
export function withErrorHandler<T>(
  handler: () => Promise<T>,
  options: ErrorHandlerOptions = {}
): Promise<T | Response> {
  return handler().catch((error: unknown) => {
    const handledError = handleError(error, options);
    return createErrorResponse(handledError);
  });
}

/**
 * Type guard to check if a response is an error response
 */
export function isErrorResponse(response: unknown): response is ApiErrorResponse {
  return (
    typeof response === "object" &&
    response !== null &&
    "success" in response &&
    (response as { success: unknown }).success === false
  );
}

/**
 * Type guard to check if a response is a success response
 */
export function isSuccessResponse<T>(response: unknown): response is ApiSuccessResponse<T> {
  return (
    typeof response === "object" &&
    response !== null &&
    "success" in response &&
    (response as { success: unknown }).success === true
  );
}
