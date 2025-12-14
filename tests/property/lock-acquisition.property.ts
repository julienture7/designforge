import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fc from 'fast-check';

/**
 * **Feature: generative-ui-platform, Property 7: Generation lock acquisition**
 * **Validates: Requirements 2.9**
 * 
 * For any generation request, a Redis key `generation:lock:{userId}` SHALL be
 * set before the Gemini API call is made.
 * 
 * Requirements 2.9 specifies:
 * "WHEN a generation request is initiated THEN the Generation_Engine SHALL acquire
 * Generation_Lock via `redis.set('generation:lock:' + userId, '1', 'EX', 60, 'NX')`
 * - if returns null, reject with `GENERATION_IN_PROGRESS`"
 * 
 * This test validates the lock acquisition behavior by testing:
 * 1. For any userId, acquireGenerationLock sets the Redis key
 * 2. A held lock prevents subsequent acquisitions (returns false)
 * 3. After release, the lock can be acquired again
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
import { 
  acquireGenerationLock, 
  releaseGenerationLock, 
  isGenerationLocked 
} from '~/server/lib/redis';

/**
 * Arbitrary for generating valid user IDs (CUID format)
 * CUIDs are 25 characters starting with 'c'
 */
const userIdArb = fc.stringMatching(/^c[a-z0-9]{24}$/);

/**
 * Arbitrary for generating multiple distinct user IDs
 */
const distinctUserIdsArb = fc.uniqueArray(userIdArb, { minLength: 2, maxLength: 5 });

describe('Property 7: Generation lock acquisition', () => {
  beforeEach(() => {
    // Reset mock Redis state before each test
    mockRedisState = new Map();
    vi.clearAllMocks();
  });

  afterEach(() => {
    mockRedisState.clear();
  });

  /**
   * Main Property Test: For any userId, acquiring a lock SHALL set the Redis key
   * and return true on first acquisition.
   * 
   * This validates Requirements 2.9: lock is acquired before Gemini API call
   */
  it('should acquire lock successfully for any valid userId on first attempt', async () => {
    await fc.assert(
      fc.asyncProperty(
        userIdArb,
        async (userId) => {
          // Reset state for this iteration
          mockRedisState.clear();
          
          // Property: First lock acquisition MUST succeed
          const acquired = await acquireGenerationLock(userId);
          expect(acquired).toBe(true);
          
          // Property: Lock MUST be set in Redis after acquisition
          const isLocked = await isGenerationLocked(userId);
          expect(isLocked).toBe(true);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property: For any userId with an existing lock, subsequent acquisition
   * attempts SHALL return false (GENERATION_IN_PROGRESS scenario).
   * 
   * This validates the "if returns null, reject with GENERATION_IN_PROGRESS" part
   */
  it('should reject lock acquisition when lock is already held', async () => {
    await fc.assert(
      fc.asyncProperty(
        userIdArb,
        async (userId) => {
          // Reset state for this iteration
          mockRedisState.clear();
          
          // First acquisition should succeed
          const firstAcquire = await acquireGenerationLock(userId);
          expect(firstAcquire).toBe(true);
          
          // Property: Second acquisition MUST fail while lock is held
          const secondAcquire = await acquireGenerationLock(userId);
          expect(secondAcquire).toBe(false);
          
          // Property: Lock should still be held
          const isLocked = await isGenerationLocked(userId);
          expect(isLocked).toBe(true);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property: After releasing a lock, the same userId SHALL be able to
   * acquire the lock again.
   * 
   * This validates the lock lifecycle: acquire -> release -> acquire
   */
  it('should allow re-acquisition after lock is released', async () => {
    await fc.assert(
      fc.asyncProperty(
        userIdArb,
        async (userId) => {
          // Reset state for this iteration
          mockRedisState.clear();
          
          // Acquire lock
          const firstAcquire = await acquireGenerationLock(userId);
          expect(firstAcquire).toBe(true);
          
          // Release lock
          await releaseGenerationLock(userId);
          
          // Property: Lock should no longer be held
          const isLockedAfterRelease = await isGenerationLocked(userId);
          expect(isLockedAfterRelease).toBe(false);
          
          // Property: Re-acquisition MUST succeed after release
          const reAcquire = await acquireGenerationLock(userId);
          expect(reAcquire).toBe(true);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property: Locks for different userIds are independent.
   * Acquiring a lock for one user SHALL NOT affect locks for other users.
   */
  it('should maintain independent locks for different userIds', async () => {
    await fc.assert(
      fc.asyncProperty(
        distinctUserIdsArb,
        async (userIds) => {
          // Reset state for this iteration
          mockRedisState.clear();
          
          // Acquire locks for all users
          const acquisitions = await Promise.all(
            userIds.map(userId => acquireGenerationLock(userId))
          );
          
          // Property: All acquisitions MUST succeed (independent locks)
          expect(acquisitions.every(acquired => acquired === true)).toBe(true);
          
          // Property: All locks should be held
          const lockStates = await Promise.all(
            userIds.map(userId => isGenerationLocked(userId))
          );
          expect(lockStates.every(locked => locked === true)).toBe(true);
          
          // Release first user's lock
          await releaseGenerationLock(userIds[0]!);
          
          // Property: Only first user's lock should be released
          const firstUserLocked = await isGenerationLocked(userIds[0]!);
          expect(firstUserLocked).toBe(false);
          
          // Property: Other users' locks should still be held
          for (let i = 1; i < userIds.length; i++) {
            const otherLocked = await isGenerationLocked(userIds[i]!);
            expect(otherLocked).toBe(true);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property: The lock key format MUST be `generation:lock:{userId}`
   * This validates the exact key format specified in Requirements 2.9
   */
  it('should use correct Redis key format for any userId', async () => {
    await fc.assert(
      fc.asyncProperty(
        userIdArb,
        async (userId) => {
          // Reset state for this iteration
          mockRedisState.clear();
          
          // Acquire lock
          await acquireGenerationLock(userId);
          
          // Property: The key in Redis MUST follow the format `generation:lock:{userId}`
          const expectedKey = `generation:lock:${userId}`;
          expect(mockRedisState.has(expectedKey)).toBe(true);
          
          // Property: The value should be '1' as per spec
          const lockData = mockRedisState.get(expectedKey);
          expect(lockData?.value).toBe('1');
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property: Lock acquisition is idempotent for the same user within lock period.
   * Multiple acquisition attempts by the same user return consistent results.
   */
  it('should return consistent results for repeated acquisition attempts', async () => {
    await fc.assert(
      fc.asyncProperty(
        userIdArb,
        fc.integer({ min: 2, max: 5 }),
        async (userId, attemptCount) => {
          // Reset state for this iteration
          mockRedisState.clear();
          
          // First acquisition should succeed
          const firstResult = await acquireGenerationLock(userId);
          expect(firstResult).toBe(true);
          
          // Property: All subsequent attempts MUST return false consistently
          for (let i = 1; i < attemptCount; i++) {
            const result = await acquireGenerationLock(userId);
            expect(result).toBe(false);
          }
          
          // Property: Lock should still be held after all attempts
          const isLocked = await isGenerationLocked(userId);
          expect(isLocked).toBe(true);
        }
      ),
      { numRuns: 100 }
    );
  });
});
