/**
 * Unit Tests for Global Error Handler
 * 
 * Tests that the error handler:
 * - Generates correlationId for each error
 * - Returns sanitized error to client (no stack trace exposed)
 * - Maps error codes to correct HTTP status codes
 * 
 * Requirements: 8.9
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  handleError,
  createErrorResponse,
  createSuccessResponse,
  createAppError,
  isErrorResponse,
  isSuccessResponse,
  ERROR_STATUS_MAP,
  ERROR_MESSAGES,
  type ErrorCode,
  type ApiErrorResponse,
  type ApiSuccessResponse,
} from "@/server/lib/error-handler";
import { TRPCError } from "@trpc/server";

// Mock the logger and error tracker
vi.mock("@/server/lib/logger", () => ({
  generateCorrelationId: vi.fn(() => "test-correlation-id-12345"),
  logError: vi.fn(),
}));

vi.mock("@/lib/utils/error-tracker", () => ({
  captureException: vi.fn(),
}));

describe("Global Error Handler", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("handleError", () => {
    it("should generate a correlationId for each error", () => {
      const error = new Error("Test error");
      const result = handleError(error);
      
      expect(result.correlationId).toBe("test-correlation-id-12345");
    });

    it("should return INTERNAL_ERROR for unknown errors", () => {
      const error = new Error("Unknown error");
      const result = handleError(error);
      
      expect(result.code).toBe("INTERNAL_ERROR");
      expect(result.statusCode).toBe(500);
    });

    it("should include correlationId in INTERNAL_ERROR message", () => {
      const error = new Error("Unknown error");
      const result = handleError(error);
      
      expect(result.message).toContain("Error ID: test-correlation-id-12345");
    });

    it("should not expose stack trace in the response", () => {
      const error = new Error("Test error");
      error.stack = "Error: Test error\n    at Object.<anonymous> (/path/to/file.ts:10:15)";
      
      const result = handleError(error);
      
      // The result should not contain any stack trace information
      expect(result.message).not.toContain("/path/to/file.ts");
      expect(result.message).not.toContain("at Object");
      expect(JSON.stringify(result)).not.toContain("stack");
    });

    it("should map TRPCError UNAUTHORIZED to UNAUTHORIZED code", () => {
      const error = new TRPCError({ code: "UNAUTHORIZED" });
      const result = handleError(error);
      
      expect(result.code).toBe("UNAUTHORIZED");
      expect(result.statusCode).toBe(401);
    });

    it("should map TRPCError FORBIDDEN to FORBIDDEN code", () => {
      const error = new TRPCError({ code: "FORBIDDEN" });
      const result = handleError(error);
      
      expect(result.code).toBe("FORBIDDEN");
      expect(result.statusCode).toBe(403);
    });

    it("should map TRPCError NOT_FOUND to PROJECT_NOT_FOUND code", () => {
      const error = new TRPCError({ code: "NOT_FOUND" });
      const result = handleError(error);
      
      expect(result.code).toBe("PROJECT_NOT_FOUND");
      expect(result.statusCode).toBe(404);
    });

    it("should map TRPCError BAD_REQUEST to VALIDATION_ERROR code", () => {
      const error = new TRPCError({ code: "BAD_REQUEST" });
      const result = handleError(error);
      
      expect(result.code).toBe("VALIDATION_ERROR");
      expect(result.statusCode).toBe(400);
    });

    it("should extract known error code from error object", () => {
      const error = { code: "CREDITS_EXHAUSTED", message: "No credits" };
      const result = handleError(error);
      
      expect(result.code).toBe("CREDITS_EXHAUSTED");
      expect(result.statusCode).toBe(402);
    });

    it("should handle string errors", () => {
      const result = handleError("Something went wrong");
      
      expect(result.code).toBe("INTERNAL_ERROR");
      expect(result.correlationId).toBe("test-correlation-id-12345");
    });

    it("should handle null/undefined errors", () => {
      const result = handleError(null);
      
      expect(result.code).toBe("INTERNAL_ERROR");
      expect(result.correlationId).toBe("test-correlation-id-12345");
    });
  });

  describe("createErrorResponse", () => {
    it("should create a Response with correct status code", async () => {
      const handledError = {
        correlationId: "test-id",
        code: "UNAUTHORIZED" as ErrorCode,
        message: "Please sign in",
        statusCode: 401,
      };
      
      const response = createErrorResponse(handledError);
      
      expect(response.status).toBe(401);
    });

    it("should create a Response with correct body structure", async () => {
      const handledError = {
        correlationId: "test-id",
        code: "VALIDATION_ERROR" as ErrorCode,
        message: "Invalid request",
        statusCode: 400,
        details: [{ field: "email", message: "Invalid email" }],
      };
      
      const response = createErrorResponse(handledError);
      const body = await response.json() as ApiErrorResponse;
      
      expect(body.success).toBe(false);
      expect(body.error.code).toBe("VALIDATION_ERROR");
      expect(body.error.message).toBe("Invalid request");
      expect(body.error.correlationId).toBe("test-id");
      expect(body.error.details).toEqual([{ field: "email", message: "Invalid email" }]);
    });

    it("should not include stack trace in response body", async () => {
      const handledError = {
        correlationId: "test-id",
        code: "INTERNAL_ERROR" as ErrorCode,
        message: "Something went wrong (Error ID: test-id)",
        statusCode: 500,
      };
      
      const response = createErrorResponse(handledError);
      const bodyText = await response.clone().text();
      
      expect(bodyText).not.toContain("stack");
      expect(bodyText).not.toContain(".ts:");
      expect(bodyText).not.toContain("at ");
    });
  });

  describe("createSuccessResponse", () => {
    it("should create a Response with status 200", async () => {
      const response = createSuccessResponse({ id: "123" });
      
      expect(response.status).toBe(200);
    });

    it("should create a Response with correct body structure", async () => {
      const data = { id: "123", name: "Test" };
      const meta = { pagination: { page: 1, pageSize: 10, total: 100 } };
      
      const response = createSuccessResponse(data, meta);
      const body = await response.json() as ApiSuccessResponse<typeof data>;
      
      expect(body.success).toBe(true);
      expect(body.data).toEqual(data);
      expect(body.meta).toEqual(meta);
    });
  });

  describe("createAppError", () => {
    it("should create an Error with the correct code", () => {
      const error = createAppError("CREDITS_EXHAUSTED");
      
      expect((error as Error & { code: string }).code).toBe("CREDITS_EXHAUSTED");
      expect(error.message).toBe(ERROR_MESSAGES.CREDITS_EXHAUSTED);
    });

    it("should include details when provided", () => {
      const details = [{ field: "email", message: "Required" }];
      const error = createAppError("VALIDATION_ERROR", details);
      
      expect((error as Error & { details: typeof details }).details).toEqual(details);
    });
  });

  describe("Type Guards", () => {
    it("isErrorResponse should return true for error responses", () => {
      const errorResponse: ApiErrorResponse = {
        success: false,
        error: {
          code: "INTERNAL_ERROR",
          message: "Error",
          correlationId: "123",
        },
      };
      
      expect(isErrorResponse(errorResponse)).toBe(true);
    });

    it("isErrorResponse should return false for success responses", () => {
      const successResponse = {
        success: true,
        data: { id: "123" },
      };
      
      expect(isErrorResponse(successResponse)).toBe(false);
    });

    it("isSuccessResponse should return true for success responses", () => {
      const successResponse = {
        success: true,
        data: { id: "123" },
      };
      
      expect(isSuccessResponse(successResponse)).toBe(true);
    });

    it("isSuccessResponse should return false for error responses", () => {
      const errorResponse: ApiErrorResponse = {
        success: false,
        error: {
          code: "INTERNAL_ERROR",
          message: "Error",
          correlationId: "123",
        },
      };
      
      expect(isSuccessResponse(errorResponse)).toBe(false);
    });
  });

  describe("ERROR_STATUS_MAP", () => {
    it("should map all error codes to correct HTTP status codes", () => {
      expect(ERROR_STATUS_MAP.UNAUTHORIZED).toBe(401);
      expect(ERROR_STATUS_MAP.FORBIDDEN).toBe(403);
      expect(ERROR_STATUS_MAP.VALIDATION_ERROR).toBe(400);
      expect(ERROR_STATUS_MAP.EMPTY_PROMPT).toBe(400);
      expect(ERROR_STATUS_MAP.PROMPT_TOO_LONG).toBe(400);
      expect(ERROR_STATUS_MAP.INVALID_QUERY).toBe(400);
      expect(ERROR_STATUS_MAP.CREDITS_EXHAUSTED).toBe(402);
      expect(ERROR_STATUS_MAP.GENERATION_IN_PROGRESS).toBe(409);
      expect(ERROR_STATUS_MAP.CONFLICT).toBe(409);
      expect(ERROR_STATUS_MAP.RATE_LIMITED).toBe(429);
      expect(ERROR_STATUS_MAP.AI_SERVICE_BUSY).toBe(429);
      expect(ERROR_STATUS_MAP.AI_SERVICE_UNAVAILABLE).toBe(503);
      expect(ERROR_STATUS_MAP.STREAM_INTERRUPTED).toBe(500);
      expect(ERROR_STATUS_MAP.INTERNAL_ERROR).toBe(500);
      expect(ERROR_STATUS_MAP.PROJECT_NOT_FOUND).toBe(404);
      expect(ERROR_STATUS_MAP.TOKEN_LIMIT_EXCEEDED).toBe(200);
      expect(ERROR_STATUS_MAP.WEBHOOK_INVALID_SIGNATURE).toBe(400);
    });
  });

  describe("ERROR_MESSAGES", () => {
    it("should have user-friendly messages for all error codes", () => {
      // All error codes should have messages
      const errorCodes = Object.keys(ERROR_STATUS_MAP) as ErrorCode[];
      
      for (const code of errorCodes) {
        expect(ERROR_MESSAGES[code]).toBeDefined();
        expect(typeof ERROR_MESSAGES[code]).toBe("string");
        expect(ERROR_MESSAGES[code].length).toBeGreaterThan(0);
      }
    });

    it("should not expose technical details in messages", () => {
      const messages = Object.values(ERROR_MESSAGES);
      
      for (const message of messages) {
        // Messages should not contain technical terms
        expect(message.toLowerCase()).not.toContain("exception");
        expect(message.toLowerCase()).not.toContain("null pointer");
        expect(message.toLowerCase()).not.toContain("database");
        expect(message.toLowerCase()).not.toContain("sql");
        expect(message.toLowerCase()).not.toContain("prisma");
      }
    });
  });
});
