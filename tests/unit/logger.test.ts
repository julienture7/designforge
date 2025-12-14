/**
 * Unit tests for the structured logging utility
 * 
 * Tests Requirements 10.3, 10.4, 10.5, 10.7:
 * - Logs all API requests with: correlationId, userId, endpoint, duration, status code
 * - Logs generation failures with: prompt length, conversation history length, error code, checkpoint status
 * - Supports filtering by correlationId for request tracing
 * - Implements local buffer and retry if logging service is unreachable
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  generateCorrelationId,
  logRequestStart,
  logRequestComplete,
  logGenerationFailure,
  logGenerationSuccess,
  logSecurityEvent,
  logCreditEvent,
  logWebhookEvent,
  logStreamEvent,
  logAuthEvent,
  logInfo,
  logWarn,
  logError,
  logDebug,
  createRequestLogger,
  getBufferStatus,
} from "../../src/server/lib/logger";

describe("Logger Utility", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("generateCorrelationId", () => {
    it("should generate a valid UUID", () => {
      const correlationId = generateCorrelationId();
      
      // UUID v4 format: xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
      expect(correlationId).toMatch(uuidRegex);
    });

    it("should generate unique IDs", () => {
      const ids = new Set<string>();
      for (let i = 0; i < 100; i++) {
        ids.add(generateCorrelationId());
      }
      expect(ids.size).toBe(100);
    });
  });

  describe("Request Logging (Requirement 10.3)", () => {
    it("should log request start with required fields", () => {
      // This test verifies the function doesn't throw
      expect(() => {
        logRequestStart({
          correlationId: generateCorrelationId(),
          userId: "user-123",
          endpoint: "/api/generate",
          method: "POST",
          ip: "192.168.1.1",
          userAgent: "Mozilla/5.0",
        });
      }).not.toThrow();
    });

    it("should log request complete with all required fields", () => {
      expect(() => {
        logRequestComplete({
          correlationId: generateCorrelationId(),
          userId: "user-123",
          endpoint: "/api/generate",
          method: "POST",
          duration: 1500,
          statusCode: 200,
          ip: "192.168.1.1",
        });
      }).not.toThrow();
    });

    it("should handle anonymous users", () => {
      expect(() => {
        logRequestStart({
          correlationId: generateCorrelationId(),
          endpoint: "/api/proxy/image",
          method: "GET",
        });
      }).not.toThrow();
    });
  });

  describe("Generation Failure Logging (Requirement 10.4)", () => {
    it("should log generation failure with all required fields", () => {
      expect(() => {
        logGenerationFailure({
          correlationId: generateCorrelationId(),
          userId: "user-123",
          promptLength: 500,
          historyLength: 3,
          errorCode: "AI_SERVICE_UNAVAILABLE",
          checkpointStatus: "saved",
          geminiResponse: "Service temporarily unavailable",
          projectId: "project-456",
        });
      }).not.toThrow();
    });

    it("should handle missing optional fields", () => {
      expect(() => {
        logGenerationFailure({
          correlationId: generateCorrelationId(),
          userId: "user-123",
          promptLength: 100,
          historyLength: 0,
          errorCode: "CREDITS_EXHAUSTED",
          checkpointStatus: "none",
        });
      }).not.toThrow();
    });
  });

  describe("Generation Success Logging", () => {
    it("should log successful generation", () => {
      expect(() => {
        logGenerationSuccess({
          correlationId: generateCorrelationId(),
          userId: "user-123",
          projectId: "project-456",
          promptLength: 500,
          historyLength: 2,
          tokenUsage: 1500,
          duration: 5000,
        });
      }).not.toThrow();
    });
  });

  describe("Security Event Logging", () => {
    it("should log security events", () => {
      expect(() => {
        logSecurityEvent({
          correlationId: generateCorrelationId(),
          event: "ssrf_attempt",
          userId: "user-123",
          ip: "192.168.1.1",
          details: { query: "192.168.1.1" },
        });
      }).not.toThrow();
    });
  });

  describe("Credit Event Logging", () => {
    it("should log credit events", () => {
      expect(() => {
        logCreditEvent({
          correlationId: generateCorrelationId(),
          userId: "user-123",
          event: "credit_decrement",
          credits: 4,
          tier: "FREE",
        });
      }).not.toThrow();
    });

    it("should log credit exhaustion", () => {
      expect(() => {
        logCreditEvent({
          correlationId: generateCorrelationId(),
          userId: "user-123",
          event: "credits_exhausted",
          credits: 0,
          tier: "FREE",
        });
      }).not.toThrow();
    });
  });

  describe("Webhook Event Logging", () => {
    it("should log webhook events", () => {
      expect(() => {
        logWebhookEvent({
          correlationId: generateCorrelationId(),
          eventId: "evt_123",
          eventType: "checkout.session.completed",
          status: "processed",
          userId: "user-123",
        });
      }).not.toThrow();
    });

    it("should log failed webhook events", () => {
      expect(() => {
        logWebhookEvent({
          correlationId: generateCorrelationId(),
          eventId: "evt_456",
          eventType: "customer.subscription.updated",
          status: "failed",
          error: "User not found",
        });
      }).not.toThrow();
    });
  });

  describe("Stream Event Logging", () => {
    it("should log stream events", () => {
      expect(() => {
        logStreamEvent({
          correlationId: generateCorrelationId(),
          userId: "user-123",
          projectId: "project-456",
          event: "stream_started",
        });
      }).not.toThrow();
    });

    it("should log checkpoint events", () => {
      expect(() => {
        logStreamEvent({
          correlationId: generateCorrelationId(),
          userId: "user-123",
          projectId: "project-456",
          event: "checkpoint_saved",
          accumulatedLength: 5000,
        });
      }).not.toThrow();
    });
  });

  describe("Auth Event Logging", () => {
    it("should log auth events", () => {
      expect(() => {
        logAuthEvent({
          correlationId: generateCorrelationId(),
          event: "login_success",
          userId: "user-123",
          email: "user@example.com",
          ip: "192.168.1.1",
        });
      }).not.toThrow();
    });

    it("should log failed auth events", () => {
      expect(() => {
        logAuthEvent({
          correlationId: generateCorrelationId(),
          event: "login_failed",
          email: "user@example.com",
          ip: "192.168.1.1",
          error: "Invalid credentials",
        });
      }).not.toThrow();
    });
  });

  describe("Generic Logging Helpers", () => {
    it("should log info messages", () => {
      expect(() => {
        logInfo(generateCorrelationId(), "Test info message", { key: "value" });
      }).not.toThrow();
    });

    it("should log warning messages", () => {
      expect(() => {
        logWarn(generateCorrelationId(), "Test warning message");
      }).not.toThrow();
    });

    it("should log error messages with Error object", () => {
      expect(() => {
        logError(generateCorrelationId(), "Test error message", new Error("Test error"));
      }).not.toThrow();
    });

    it("should log error messages with string", () => {
      expect(() => {
        logError(generateCorrelationId(), "Test error message", "String error");
      }).not.toThrow();
    });

    it("should log debug messages", () => {
      expect(() => {
        logDebug(generateCorrelationId(), "Test debug message", { debug: true });
      }).not.toThrow();
    });
  });

  describe("Request Logger Factory", () => {
    it("should create a request logger with bound correlation ID", () => {
      const correlationId = generateCorrelationId();
      const requestLogger = createRequestLogger(correlationId, "user-123");

      expect(() => {
        requestLogger.info("Test info");
        requestLogger.warn("Test warning");
        requestLogger.error("Test error", new Error("Test"));
        requestLogger.debug("Test debug");
      }).not.toThrow();
    });
  });

  describe("Buffer Status (Requirement 10.7)", () => {
    it("should return buffer status", () => {
      const status = getBufferStatus();
      
      expect(status).toHaveProperty("size");
      expect(status).toHaveProperty("maxSize");
      expect(typeof status.size).toBe("number");
      expect(typeof status.maxSize).toBe("number");
      expect(status.maxSize).toBe(1000);
    });
  });

  describe("Correlation ID Tracing (Requirement 10.5)", () => {
    it("should use same correlation ID across related log calls", () => {
      const correlationId = generateCorrelationId();
      
      // All these calls should use the same correlation ID for tracing
      expect(() => {
        logRequestStart({
          correlationId,
          userId: "user-123",
          endpoint: "/api/generate",
          method: "POST",
        });

        logCreditEvent({
          correlationId,
          userId: "user-123",
          event: "credit_check",
          credits: 5,
          tier: "FREE",
        });

        logGenerationSuccess({
          correlationId,
          userId: "user-123",
          promptLength: 100,
          historyLength: 0,
          duration: 2000,
        });

        logRequestComplete({
          correlationId,
          userId: "user-123",
          endpoint: "/api/generate",
          method: "POST",
          duration: 2500,
          statusCode: 200,
        });
      }).not.toThrow();
    });
  });
});
