/**
 * Structured Logging Utility
 * 
 * Provides centralized structured logging using Pino.
 * Implements Requirements 10.3, 10.4, 10.5, 10.7:
 * - Logs all API requests with: correlationId, userId, endpoint, duration, status code
 * - Logs generation failures with: prompt length, conversation history length, error code, checkpoint status
 * - Supports filtering by correlationId for request tracing
 * - Implements local buffer and retry if logging service is unreachable
 */

import pino, { type Logger, type LoggerOptions } from "pino";

// Buffer for logs when logging service is unreachable
interface BufferedLog {
  level: string;
  message: string;
  data: Record<string, unknown>;
  timestamp: string;
}

const logBuffer: BufferedLog[] = [];
const MAX_BUFFER_SIZE = 1000;
let isRetrying = false;

// Create base logger configuration
const loggerOptions: LoggerOptions = {
  level: process.env.LOG_LEVEL ?? "info",
  formatters: {
    level: (label) => ({ level: label }),
  },
  base: {
    service: "generative-ui-platform",
    env: process.env.NODE_ENV ?? "development",
  },
  timestamp: pino.stdTimeFunctions.isoTime,
};

// Use pino-pretty in development for readable logs
const transport = process.env.NODE_ENV === "development"
  ? {
      target: "pino-pretty",
      options: {
        colorize: true,
        translateTime: "SYS:standard",
        ignore: "pid,hostname",
      },
    }
  : undefined;

// Create the logger instance
export const logger: Logger = transport
  ? pino(loggerOptions, pino.transport(transport))
  : pino(loggerOptions);

/**
 * Generate a correlation ID for request tracing
 */
export function generateCorrelationId(): string {
  return crypto.randomUUID();
}

/**
 * Add log to buffer when logging service is unreachable
 */
function bufferLog(level: string, message: string, data: Record<string, unknown>): void {
  if (logBuffer.length >= MAX_BUFFER_SIZE) {
    // Remove oldest logs if buffer is full
    logBuffer.shift();
  }
  
  logBuffer.push({
    level,
    message,
    data,
    timestamp: new Date().toISOString(),
  });
}

/**
 * Retry sending buffered logs
 */
async function retryBufferedLogs(): Promise<void> {
  if (isRetrying || logBuffer.length === 0) return;
  
  isRetrying = true;
  
  try {
    while (logBuffer.length > 0) {
      const log = logBuffer.shift();
      if (log) {
        const logFn = logger[log.level as keyof Logger] as (obj: Record<string, unknown>, msg: string) => void;
        if (typeof logFn === "function") {
          logFn.call(logger, log.data, log.message);
        }
      }
    }
  } catch {
    // If retry fails, logs remain in buffer
  } finally {
    isRetrying = false;
  }
}

/**
 * Safe logging wrapper that buffers on failure
 */
function safeLog(
  level: "info" | "warn" | "error" | "debug" | "fatal",
  data: Record<string, unknown>,
  message: string
): void {
  try {
    const logFn = logger[level];
    if (typeof logFn === "function") {
      logFn.call(logger, data, message);
    }
    
    // Try to flush buffered logs
    void retryBufferedLogs();
  } catch {
    // Buffer the log if logging fails
    bufferLog(level, message, data);
  }
}

// ============================================================================
// API Request Logging (Requirement 10.3)
// ============================================================================

export interface RequestLogParams {
  correlationId: string;
  userId?: string;
  endpoint: string;
  method: string;
  duration?: number;
  statusCode?: number;
  ip?: string;
  userAgent?: string;
}

/**
 * Log API request start
 * Requirement 10.3: Log all API requests with correlationId, userId, endpoint
 */
export function logRequestStart(params: Omit<RequestLogParams, "duration" | "statusCode">): void {
  safeLog("info", {
    correlationId: params.correlationId,
    userId: params.userId ?? "anonymous",
    endpoint: params.endpoint,
    method: params.method,
    ip: params.ip,
    userAgent: params.userAgent,
    phase: "start",
  }, `Request started: ${params.method} ${params.endpoint}`);
}

/**
 * Log API request completion
 * Requirement 10.3: Log all API requests with correlationId, userId, endpoint, duration, status code
 */
export function logRequestComplete(params: RequestLogParams): void {
  const level = params.statusCode && params.statusCode >= 400 ? "warn" : "info";
  
  safeLog(level, {
    correlationId: params.correlationId,
    userId: params.userId ?? "anonymous",
    endpoint: params.endpoint,
    method: params.method,
    duration: params.duration,
    statusCode: params.statusCode,
    ip: params.ip,
    phase: "complete",
  }, `Request completed: ${params.method} ${params.endpoint} - ${params.statusCode} (${params.duration}ms)`);
}

// ============================================================================
// Generation Failure Logging (Requirement 10.4)
// ============================================================================

export interface GenerationFailureParams {
  correlationId: string;
  userId: string;
  promptLength: number;
  historyLength: number;
  errorCode: string;
  checkpointStatus: "saved" | "failed" | "none";
  geminiResponse?: string;
  projectId?: string;
}

/**
 * Log generation failure
 * Requirement 10.4: Log generation failures with prompt length, conversation history length, 
 * error code, Gemini API response (if available), and checkpoint status
 */
export function logGenerationFailure(params: GenerationFailureParams): void {
  safeLog("error", {
    event: "generation_failure",
    correlationId: params.correlationId,
    userId: params.userId,
    promptLength: params.promptLength,
    historyLength: params.historyLength,
    errorCode: params.errorCode,
    checkpointStatus: params.checkpointStatus,
    geminiResponse: params.geminiResponse,
    projectId: params.projectId,
  }, `Generation failed: ${params.errorCode}`);
}

// ============================================================================
// Generation Success Logging
// ============================================================================

export interface GenerationSuccessParams {
  correlationId: string;
  userId: string;
  projectId?: string;
  promptLength: number;
  historyLength: number;
  tokenUsage?: number;
  duration: number;
}

/**
 * Log successful generation
 */
export function logGenerationSuccess(params: GenerationSuccessParams): void {
  safeLog("info", {
    event: "generation_success",
    correlationId: params.correlationId,
    userId: params.userId,
    projectId: params.projectId,
    promptLength: params.promptLength,
    historyLength: params.historyLength,
    tokenUsage: params.tokenUsage,
    duration: params.duration,
  }, `Generation completed successfully`);
}

// ============================================================================
// Security Event Logging
// ============================================================================

export interface SecurityEventParams {
  correlationId: string;
  event: string;
  userId?: string;
  ip?: string;
  details?: Record<string, unknown>;
}

/**
 * Log security-related events (SSRF attempts, rate limiting, etc.)
 */
export function logSecurityEvent(params: SecurityEventParams): void {
  safeLog("warn", {
    event: params.event,
    correlationId: params.correlationId,
    userId: params.userId,
    ip: params.ip,
    ...params.details,
  }, `Security event: ${params.event}`);
}

// ============================================================================
// Credit System Logging
// ============================================================================

export interface CreditEventParams {
  correlationId: string;
  userId: string;
  event: "credit_check" | "credit_decrement" | "credit_decrement_failed" | "credits_exhausted";
  credits?: number;
  tier?: string;
  reason?: string;
}

/**
 * Log credit-related events
 */
export function logCreditEvent(params: CreditEventParams): void {
  const level = params.event === "credit_decrement_failed" || params.event === "credits_exhausted" 
    ? "warn" 
    : "info";
  
  safeLog(level, {
    event: params.event,
    correlationId: params.correlationId,
    userId: params.userId,
    credits: params.credits,
    tier: params.tier,
    reason: params.reason,
  }, `Credit event: ${params.event}`);
}

// ============================================================================
// Webhook Logging
// ============================================================================

export interface WebhookEventParams {
  correlationId: string;
  eventId: string;
  eventType: string;
  status: "received" | "processed" | "duplicate" | "failed";
  userId?: string;
  error?: string;
}

/**
 * Log webhook events
 */
export function logWebhookEvent(params: WebhookEventParams): void {
  const level = params.status === "failed" ? "error" : "info";
  
  safeLog(level, {
    event: "webhook",
    correlationId: params.correlationId,
    eventId: params.eventId,
    eventType: params.eventType,
    status: params.status,
    userId: params.userId,
    error: params.error,
  }, `Webhook ${params.eventType}: ${params.status}`);
}

// ============================================================================
// Stream/Checkpoint Logging
// ============================================================================

export interface StreamEventParams {
  correlationId: string;
  userId: string;
  projectId?: string;
  event: "stream_started" | "stream_interrupted" | "stream_completed" | "checkpoint_saved" | "checkpoint_failed" | "checkpoint_resumed";
  accumulatedLength?: number;
  error?: string;
}

/**
 * Log stream and checkpoint events
 */
export function logStreamEvent(params: StreamEventParams): void {
  const level = params.event.includes("failed") || params.event.includes("interrupted") 
    ? "warn" 
    : "info";
  
  safeLog(level, {
    event: params.event,
    correlationId: params.correlationId,
    userId: params.userId,
    projectId: params.projectId,
    accumulatedLength: params.accumulatedLength,
    error: params.error,
  }, `Stream event: ${params.event}`);
}

// ============================================================================
// Auth Logging
// ============================================================================

export interface AuthEventParams {
  correlationId: string;
  event: "login_success" | "login_failed" | "logout" | "session_expired" | "registration" | "auth_error";
  userId?: string;
  email?: string;
  ip?: string;
  error?: string;
}

/**
 * Log authentication events
 */
export function logAuthEvent(params: AuthEventParams): void {
  const level = params.event.includes("failed") || params.event.includes("error") 
    ? "warn" 
    : "info";
  
  safeLog(level, {
    event: params.event,
    correlationId: params.correlationId,
    userId: params.userId,
    // Don't log full email for privacy - just domain
    emailDomain: params.email?.split("@")[1],
    ip: params.ip,
    error: params.error,
  }, `Auth event: ${params.event}`);
}

// ============================================================================
// Database Logging
// ============================================================================

export interface DatabaseEventParams {
  correlationId: string;
  operation: string;
  table: string;
  duration?: number;
  error?: string;
}

/**
 * Log database operations
 */
export function logDatabaseEvent(params: DatabaseEventParams): void {
  const level = params.error ? "error" : "debug";
  
  safeLog(level, {
    event: "database_operation",
    correlationId: params.correlationId,
    operation: params.operation,
    table: params.table,
    duration: params.duration,
    error: params.error,
  }, `Database ${params.operation} on ${params.table}`);
}

// ============================================================================
// Generic Logging Helpers
// ============================================================================

/**
 * Log an info message with correlation ID
 */
export function logInfo(correlationId: string, message: string, data?: Record<string, unknown>): void {
  safeLog("info", { correlationId, ...data }, message);
}

/**
 * Log a warning with correlation ID
 */
export function logWarn(correlationId: string, message: string, data?: Record<string, unknown>): void {
  safeLog("warn", { correlationId, ...data }, message);
}

/**
 * Log an error with correlation ID
 */
export function logError(correlationId: string, message: string, error?: Error | unknown, data?: Record<string, unknown>): void {
  const errorData = error instanceof Error 
    ? { errorMessage: error.message, errorStack: error.stack }
    : { errorMessage: String(error) };
  
  safeLog("error", { correlationId, ...errorData, ...data }, message);
}

/**
 * Log a debug message with correlation ID
 */
export function logDebug(correlationId: string, message: string, data?: Record<string, unknown>): void {
  safeLog("debug", { correlationId, ...data }, message);
}

// ============================================================================
// Request Context Helper
// ============================================================================

/**
 * Create a request logger with pre-bound correlation ID
 */
export function createRequestLogger(correlationId: string, userId?: string) {
  return {
    info: (message: string, data?: Record<string, unknown>) => 
      logInfo(correlationId, message, { userId, ...data }),
    warn: (message: string, data?: Record<string, unknown>) => 
      logWarn(correlationId, message, { userId, ...data }),
    error: (message: string, error?: Error | unknown, data?: Record<string, unknown>) => 
      logError(correlationId, message, error, { userId, ...data }),
    debug: (message: string, data?: Record<string, unknown>) => 
      logDebug(correlationId, message, { userId, ...data }),
  };
}

// ============================================================================
// Buffer Status (for monitoring)
// ============================================================================

/**
 * Get current buffer status
 */
export function getBufferStatus(): { size: number; maxSize: number } {
  return {
    size: logBuffer.length,
    maxSize: MAX_BUFFER_SIZE,
  };
}

/**
 * Manually flush buffered logs
 */
export async function flushBufferedLogs(): Promise<void> {
  await retryBufferedLogs();
}

export default logger;
