import { z, type ZodError } from "zod";

/**
 * Common Zod validation schemas and utilities
 * 
 * @see Requirements 8.1, 8.2, 8.10
 */

/**
 * Conversation message schema - shared between generate and project validators
 * Uses .strict() mode to reject unknown keys
 */
export const conversationMessageSchema = z.object({
  role: z.enum(["user", "model"]),
  content: z.string(),
}).strict();

export type ConversationMessage = z.infer<typeof conversationMessageSchema>;

/**
 * Version history entry schema
 * Uses .strict() mode to reject unknown keys
 */
export const versionHistoryEntrySchema = z.object({
  html: z.string(),
  timestamp: z.string(),
}).strict();

export type VersionHistoryEntry = z.infer<typeof versionHistoryEntrySchema>;

/**
 * Pagination schema - shared across list endpoints
 * Uses .strict() mode to reject unknown keys
 */
export const paginationSchema = z.object({
  page: z.number().int().min(1).default(1),
  pageSize: z.number().int().min(1).max(100).default(20),
}).strict();

export type PaginationInput = z.infer<typeof paginationSchema>;

/**
 * CUID schema for ID validation
 */
export const cuidSchema = z.string().cuid();

/**
 * Visibility enum schema
 */
export const visibilitySchema = z.enum(["PUBLIC", "PRIVATE"]);

export type Visibility = z.infer<typeof visibilitySchema>;

/**
 * Validation error detail - client-safe format
 * Only includes first-level field names, not nested paths or internal schema details
 * Uses Record<string, string> for compatibility with existing error response types
 * 
 * @see Requirements 8.2, 8.10
 */
export type ValidationErrorDetail = Record<string, string> & {
  field: string;
  message: string;
};

/**
 * Transform Zod errors to client-safe format
 * 
 * - Only includes first-level field names (not nested paths like "conversationHistory.0.role")
 * - Strips internal schema details
 * - Returns array of { field, message } objects
 * 
 * @see Requirements 8.2, 8.10
 */
export function transformZodErrors(error: ZodError): ValidationErrorDetail[] {
  const details: ValidationErrorDetail[] = [];
  const seenFields = new Set<string>();

  for (const issue of error.errors) {
    // Get first-level field name only
    // For paths like ["conversationHistory", 0, "role"], we only want "conversationHistory"
    const firstLevelField = issue.path.length > 0 
      ? String(issue.path[0]) 
      : "input";

    // Only include each field once (first error wins)
    if (seenFields.has(firstLevelField)) {
      continue;
    }
    seenFields.add(firstLevelField);

    // Create client-safe message
    let message = issue.message;

    // Handle specific Zod error codes with user-friendly messages
    if (issue.code === "unrecognized_keys") {
      message = `Unknown field(s) provided`;
    } else if (issue.code === "invalid_type") {
      if (issue.received === "undefined") {
        message = `${firstLevelField} is required`;
      } else {
        message = `Invalid type for ${firstLevelField}`;
      }
    }

    details.push({
      field: firstLevelField,
      message,
    });
  }

  return details;
}

/**
 * Create a VALIDATION_ERROR response object
 * 
 * @see Requirements 8.2
 */
export function createValidationErrorResponse(
  error: ZodError,
  correlationId: string
) {
  return {
    success: false as const,
    error: {
      code: "VALIDATION_ERROR" as const,
      message: "Invalid request",
      details: transformZodErrors(error),
      correlationId,
    },
  };
}

/**
 * Image proxy query schema
 * Uses .strict() mode to reject unknown keys
 * 
 * Note: SSRF validation is done separately after Zod validation
 * 
 * @see Requirements 3.10
 */
export const imageProxyQuerySchema = z.object({
  query: z
    .string()
    .trim()
    .min(1, "Query cannot be empty")
    .max(200, "Query exceeds maximum length of 200 characters"),
}).strict();

export type ImageProxyQuery = z.infer<typeof imageProxyQuerySchema>;
