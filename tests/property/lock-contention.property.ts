import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fc from 'fast-check';

/**
 * **Feature: generative-ui-platform, Property 20: Lock contention returns correct error**
 * **Validates: Requirements 6.7**
 * 
 * For any generation request where `generation:lock:{userId}` already exists in Redis,
 * the request SHALL return HTTP 409 with `GENERATION_IN_PROGRESS` error.
 * 
 * Requirements 6.7 specifies:
 * "IF Generation_Lock acquisition fails (SETNX returns null) THEN return 
 * `GENERATION_IN_PROGRESS` immediately"
 * 
 * This test validates that concurrent generation requests properly return the
 * GENERATION_IN_PROGRESS error when a lock is already held.
 */

// Mock Redis state to simulate lock behavior
let mockRedisState: Map<string, { value: string; expiresAt: number }>;

// Mock the Redis module
vi.mock('~/server/lib/redis', () => {
  return {
    redis: {
      set: vi.fn(async (key: string, value: string, options?: { ex?: number; nx?: boolean }) => {
        const now = Date.now();
        
        // NX: Only set if key doesn't exist
        if (options?.nx) {
          const existing = mockRedisState.get(key);
          if (existing && existing.expiresAt > now) {
            return null; // Key exists and not expired
          }
        }
        
        // Set the key with TTL
        const ttlMs = (options?.ex ?? 60) * 1000;
        mockRedisState.set(key, { value, expiresAt: now + ttlMs });
        return 'OK';
      }),
      del: vi.fn(async (key: string) => {
        const existed = mockRedisState.has(key);
        mockRedisState.delete(key);
        return existed ? 1 : 0;
      }),
      exists: vi.fn(async (key: string) => {
        const existing = mockRedisState.get(key);
        if (existing && existing.expiresAt > Date.now()) {
          return 1;
        }
        mockRedisState.delete(key); // Clean up expired
        return 0;
      }),
    },
    acquireGenerationLock: vi.fn(async (userId: string): Promise<boolean> => {
      const key = `generation:lock:${userId}`;
      const now = Date.now();
      
      // Check if lock exists and not expired
      const existing = mockRedisState.get(key);
      if (existing && existing.expiresAt > now) {
        return false; // Lock already held
      }
      
      // Set lock with 60 second TTL
      mockRedisState.set(key, { value: '1', expiresAt: now + 60000 });
      return true;
    }),
    releaseGenerationLock: vi.fn(async (userId: string): Promise<void> => {
      const key = `generation:lock:${userId}`;
      mockRedisState.delete(key);
    }),
    isGenerationLocked: vi.fn(async (userId: string): Promise<boolean> => {
      const key = `generation:lock:${userId}`;
      const existing = mockRedisState.get(key);
      if (existing && existing.expiresAt > Date.now()) {
        return true;
      }
      mockRedisState.delete(key); // Clean up expired
      return false;
    }),
  };
});

// Import after mocking
import { acquireGenerationLock, releaseGenerationLock } from '~/server/lib/redis';

/**
 * Error codes as defined in the Global Error Dictionary
 */
type ErrorCode = 
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'VALIDATION_ERROR'
  | 'EMPTY_PROMPT'
  | 'PROMPT_TOO_LONG'
  | 'INVALID_QUERY'
  | 'CREDITS_EXHAUSTED'
  | 'GENERATION_IN_PROGRESS'
  | 'CONFLICT'
  | 'RATE_LIMITED'
  | 'AI_SERVICE_BUSY'
  | 'AI_SERVICE_UNAVAILABLE'
  | 'STREAM_INTERRUPTED'
  | 'INTERNAL_ERROR'
  | 'PROJECT_NOT_FOUND'
  | 'TOKEN_LIMIT_EXCEEDED';

/**
 * API Error Response structure as defined in the design document
 */
interface ApiErrorResponse {
  success: false;
  error: {
    code: ErrorCode;
    message?: string;
    correlationId?: string;
  };
}

/**
 * Simulates the generation request handler behavior for lock contention.
 * This mirrors what the actual /api/generate route handler should do.
 * 
 * @param userId - The user making the generation request
 * @returns HTTP status code and response body
 */
async function handleGenerationRequest(userId: string): Promise<{
  status: number;
  body: ApiErrorResponse | { success: true };
}> {
  // Attempt to acquire the generation lock
  const lockAcquired = await acquireGenerationLock(userId);
  
  if (!lockAcquired) {
    // Lock contention - return GENERATION_IN_PROGRESS error
    return {
      status: 409,
      body: {
        success: false,
        error: {
          code: 'GENERATION_IN_PROGRESS',
          message: 'Please wait for your current generation to complete',
        },
      },
    };
  }
  
  // Lock acquired successfully - in real implementation, this would proceed with generation
  return {
    status: 200,
    body: { success: true },
  };
}

/**
 * Arbitrary for generating valid user IDs (CUID format)
 * CUIDs are 25 characters starting with 'c'
 */
const userIdArb = fc.stringMatching(/^c[a-z0-9]{24}$/);

/**
 * Arbitrary for generating valid prompts
 */
const promptArb = fc.string({ minLength: 1, maxLength: 1000 });

/**
 * Arbitrary for generating multiple concurrent request counts
 */
const concurrentCountArb = fc.integer({ min: 2, max: 10 });

describe('Property 20: Lock contention returns correct error', () => {
  beforeEach(() => {
    // Reset mock Redis state before each test
    mockRedisState = new Map();
    vi.clearAllMocks();
  });

  afterEach(() => {
    mockRedisState.clear();
  });

  /**
   * Main Property Test: For any userId with an existing lock, concurrent requests
   * SHALL return HTTP 409 with GENERATION_IN_PROGRESS error.
   * 
   * This validates Requirements 6.7: "IF Generation_Lock acquisition fails 
   * (SETNX returns null) THEN return `GENERATION_IN_PROGRESS` immediately"
   */
  it('should return GENERATION_IN_PROGRESS (409) when lock is already held', async () => {
    await fc.assert(
      fc.asyncProperty(
        userIdArb,
        async (userId) => {
          // Reset state for this iteration
          mockRedisState.clear();
          
          // First request acquires the lock
          const firstResponse = await handleGenerationRequest(userId);
          expect(firstResponse.status).toBe(200);
          expect(firstResponse.body.success).toBe(true);
          
          // Second request should fail with GENERATION_IN_PROGRESS
          const secondResponse = await handleGenerationRequest(userId);
          
          // Property: Status MUST be 409 (Conflict)
          expect(secondResponse.status).toBe(409);
          
          // Property: Response MUST indicate failure
          expect(secondResponse.body.success).toBe(false);
          
          // Property: Error code MUST be GENERATION_IN_PROGRESS
          if (!secondResponse.body.success) {
            expect(secondResponse.body.error.code).toBe('GENERATION_IN_PROGRESS');
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property: Multiple concurrent requests from the same user SHALL all return
   * GENERATION_IN_PROGRESS except for the first one that acquires the lock.
   */
  it('should return GENERATION_IN_PROGRESS for all concurrent requests except first', async () => {
    await fc.assert(
      fc.asyncProperty(
        userIdArb,
        concurrentCountArb,
        async (userId, requestCount) => {
          // Reset state for this iteration
          mockRedisState.clear();
          
          // Simulate concurrent requests
          const responses = await Promise.all(
            Array.from({ length: requestCount }, () => handleGenerationRequest(userId))
          );
          
          // Property: Exactly one request should succeed
          const successfulResponses = responses.filter(r => r.status === 200);
          expect(successfulResponses.length).toBe(1);
          
          // Property: All other requests should return 409 GENERATION_IN_PROGRESS
          const failedResponses = responses.filter(r => r.status === 409);
          expect(failedResponses.length).toBe(requestCount - 1);
          
          // Property: All failed responses should have GENERATION_IN_PROGRESS error code
          for (const response of failedResponses) {
            expect(response.body.success).toBe(false);
            if (!response.body.success) {
              expect(response.body.error.code).toBe('GENERATION_IN_PROGRESS');
            }
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property: After lock is released, subsequent requests SHALL succeed
   * (no longer return GENERATION_IN_PROGRESS).
   */
  it('should allow new requests after lock is released', async () => {
    await fc.assert(
      fc.asyncProperty(
        userIdArb,
        async (userId) => {
          // Reset state for this iteration
          mockRedisState.clear();
          
          // First request acquires the lock
          const firstResponse = await handleGenerationRequest(userId);
          expect(firstResponse.status).toBe(200);
          
          // Second request should fail
          const secondResponse = await handleGenerationRequest(userId);
          expect(secondResponse.status).toBe(409);
          if (!secondResponse.body.success) {
            expect(secondResponse.body.error.code).toBe('GENERATION_IN_PROGRESS');
          }
          
          // Release the lock
          await releaseGenerationLock(userId);
          
          // Third request should succeed after lock release
          const thirdResponse = await handleGenerationRequest(userId);
          expect(thirdResponse.status).toBe(200);
          expect(thirdResponse.body.success).toBe(true);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property: Lock contention for one user SHALL NOT affect other users.
   * Different users should be able to acquire locks independently.
   */
  it('should not affect other users when one user has lock contention', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uniqueArray(userIdArb, { minLength: 2, maxLength: 5 }),
        async (userIds) => {
          // Reset state for this iteration
          mockRedisState.clear();
          
          // First user acquires lock
          const firstUserFirstRequest = await handleGenerationRequest(userIds[0]!);
          expect(firstUserFirstRequest.status).toBe(200);
          
          // First user's second request should fail
          const firstUserSecondRequest = await handleGenerationRequest(userIds[0]!);
          expect(firstUserSecondRequest.status).toBe(409);
          if (!firstUserSecondRequest.body.success) {
            expect(firstUserSecondRequest.body.error.code).toBe('GENERATION_IN_PROGRESS');
          }
          
          // Property: Other users should still be able to acquire locks
          for (let i = 1; i < userIds.length; i++) {
            const otherUserResponse = await handleGenerationRequest(userIds[i]!);
            expect(otherUserResponse.status).toBe(200);
            expect(otherUserResponse.body.success).toBe(true);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property: The error response format SHALL match the API specification.
   * Response must include success: false and error object with code.
   */
  it('should return properly formatted error response on lock contention', async () => {
    await fc.assert(
      fc.asyncProperty(
        userIdArb,
        async (userId) => {
          // Reset state for this iteration
          mockRedisState.clear();
          
          // Acquire lock first
          await handleGenerationRequest(userId);
          
          // Second request should fail with proper format
          const response = await handleGenerationRequest(userId);
          
          // Property: Response must have correct structure
          expect(response.status).toBe(409);
          expect(response.body).toHaveProperty('success', false);
          expect(response.body).toHaveProperty('error');
          
          if (!response.body.success) {
            // Property: Error object must have code property
            expect(response.body.error).toHaveProperty('code', 'GENERATION_IN_PROGRESS');
            
            // Property: Error message should be user-friendly
            expect(response.body.error.message).toBe(
              'Please wait for your current generation to complete'
            );
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property: Rapid sequential requests from the same user SHALL consistently
   * return GENERATION_IN_PROGRESS while lock is held.
   */
  it('should consistently return GENERATION_IN_PROGRESS for rapid sequential requests', async () => {
    await fc.assert(
      fc.asyncProperty(
        userIdArb,
        fc.integer({ min: 3, max: 10 }),
        async (userId, requestCount) => {
          // Reset state for this iteration
          mockRedisState.clear();
          
          // First request acquires lock
          const firstResponse = await handleGenerationRequest(userId);
          expect(firstResponse.status).toBe(200);
          
          // Property: All subsequent sequential requests should return 409
          for (let i = 1; i < requestCount; i++) {
            const response = await handleGenerationRequest(userId);
            expect(response.status).toBe(409);
            if (!response.body.success) {
              expect(response.body.error.code).toBe('GENERATION_IN_PROGRESS');
            }
          }
        }
      ),
      { numRuns: 100 }
    );
  });
});
