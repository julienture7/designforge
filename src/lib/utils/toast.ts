/**
 * Toast Utility Functions
 * 
 * Provides utility functions for displaying toast notifications,
 * particularly for API errors.
 * 
 * Requirements: 4.6
 */

import type { ToastAction } from "~/components/ui/Toast";

/**
 * Error code to user-friendly message mapping
 */
const ERROR_MESSAGES: Record<string, string> = {
  // Authentication errors
  UNAUTHORIZED: "Please sign in to continue",
  SESSION_EXPIRED: "Your session has expired. Please sign in again",
  INVALID_CREDENTIALS: "Invalid email or password",
  
  // Credit errors
  CREDITS_EXHAUSTED: "You've used all your credits. Upgrade to Pro for unlimited generations",
  CREDIT_DECREMENT_FAILED: "Failed to process credits. Please try again",
  
  // Generation errors
  GENERATION_IN_PROGRESS: "A generation is already in progress. Please wait",
  EMPTY_PROMPT: "Please enter a prompt to generate",
  PROMPT_TOO_LONG: "Your prompt is too long. Please shorten it",
  TOKEN_LIMIT_EXCEEDED: "The response was too long. Try continuing the generation",
  STREAM_INTERRUPTED: "Connection was interrupted. You can resume generation",
  STREAM_ERROR: "Failed to receive response. Please try again",
  
  // API errors
  RATE_LIMITED: "Too many requests. Please wait a moment",
  API_ERROR: "An error occurred with the AI service. Please try again",
  TIMEOUT: "The request timed out. Please try again",
  
  // Project errors
  PROJECT_NOT_FOUND: "Project not found",
  SAVE_FAILED: "Failed to save project. Your changes are stored locally",
  
  // General errors
  UNKNOWN_ERROR: "An unexpected error occurred",
  INTERNAL_ERROR: "Something went wrong. Please try again",
  NETWORK_ERROR: "Network error. Please check your connection",
  CONFLICT: "A conflict occurred. Please refresh and try again",
};

/**
 * Get user-friendly error message from error code
 */
export function getErrorMessage(code: string): string {
  return ERROR_MESSAGES[code] ?? ERROR_MESSAGES.UNKNOWN_ERROR ?? "An unexpected error occurred";
}

/**
 * Format API error for toast display
 * 
 * @param code - Error code from API
 * @param message - Optional detailed message from API
 * @returns Formatted error object for toast
 */
export function formatApiError(
  code: string,
  message?: string
): { title: string; details?: string } {
  const title = getErrorMessage(code);
  
  // Only include details if they provide additional context
  const details = message && message !== title ? message : undefined;
  
  return { title, details };
}

/**
 * Create toast action for common error scenarios
 */
export function createErrorAction(
  code: string,
  callbacks?: {
    onRetry?: () => void;
    onUpgrade?: () => void;
    onSignIn?: () => void;
    onResume?: () => void;
  }
): ToastAction | undefined {
  switch (code) {
    case "CREDITS_EXHAUSTED":
      return callbacks?.onUpgrade
        ? { label: "Upgrade to Pro", onClick: callbacks.onUpgrade }
        : undefined;
    
    case "UNAUTHORIZED":
    case "SESSION_EXPIRED":
      return callbacks?.onSignIn
        ? { label: "Sign In", onClick: callbacks.onSignIn }
        : undefined;
    
    case "STREAM_INTERRUPTED":
      return callbacks?.onResume
        ? { label: "Resume Generation", onClick: callbacks.onResume }
        : undefined;
    
    case "TIMEOUT":
    case "API_ERROR":
    case "NETWORK_ERROR":
    case "STREAM_ERROR":
      return callbacks?.onRetry
        ? { label: "Try Again", onClick: callbacks.onRetry }
        : undefined;
    
    default:
      return undefined;
  }
}

export default {
  getErrorMessage,
  formatApiError,
  createErrorAction,
};
