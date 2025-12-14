import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as fc from 'fast-check';

/**
 * **Feature: generative-ui-platform, Property 21: OCC conflict returns correct error**
 * **Validates: Requirements 6.8**
 * 
 * For any credit decrement where the `version` field has changed since read,
 * the operation SHALL return HTTP 409 with `CONFLICT` error.
 * 
 * Requirements 6.8 specifies:
 * "IF OCC update returns `count: 0` (version mismatch or credits depleted) 
 * THEN return `CONFLICT` error and release Generation_Lock"
 */

// Mock database state
let mockUsers: Map<string, { id: string; tier: 'FREE' | 'PRO'; credits: number; version: number }>;

// Track updateMany calls to verify OCC pattern
let updateManyCalls: Array<{
  where: { id: string; credits?: { gt: number }; version?: number };
  data: { credits?: { decrement: number }; version?: { increment: number } };
}>;

// Mock the database module
vi.mock('~/server/db', () => {
  return {
    db: {
      user: {
        findUnique: vi.fn(async ({ where }: { where: { id: string } }) => {
          return mockUsers.get(where.id) ?? null;
        }),
        updateMany: vi.fn(),
      },
      $transaction: vi.fn(async (callback: (tx: unknown) => Promise<unknown>) => {
        const txMock = {
          user: {
            updateMany: vi.fn(async (args: {
              where: { id: string; credits?: { gt: number }; version?: number };
              data: { credits?: { decrement: number }; version?: { increment: number } };
            }) => {
              updateManyCalls.push(args);
              
              const user = mockUsers.get(args.where.id);
              if (!user) return { count: 0 };
              
              const versionMatches = args.where.version === undefined || args.where.version === user.version;
              const hasCredits = args.where.credits?.gt === undefined || user.credits > (args.where.credits.gt);
              
              if (versionMatches && hasCredits) {
                if (args.data.credits?.decrement) {
                  user.credits -= args.data.credits.decrement;
                }
                if (args.data.version?.increment) {
                  user.version += args.data.version.increment;
                }
                mockUsers.set(user.id, user);
                return { count: 1 };
              }
              
              return { count: 0 };
            }),
            findUnique: vi.fn(async ({ where }: { where: { id: string } }) => {
              return mockUsers.get(where.id) ?? null;
            }),
          },
        };
        return callback(txMock);
      }),
    },
  };
});

// Import after mocking
import { decrementCredits } from '~/server/services/credit.service';

/**
 * Error codes as defined in the requirements
 */
type ErrorCode = 
  | 'CONFLICT'
  | 'CREDITS_EXHAUSTED'
  | 'GENERATION_IN_PROGRESS';

/**
 * Result type that includes error information for OCC conflicts
 */
interface DecrementResultWithError {
  success: boolean;
  newCredits?: number;
  newVersion?: number;
  errorCode?: ErrorCode;
}

/**
 * Arbitrary for generating valid user IDs (CUID format)
 */
const userIdArb = fc.stringMatching(/^c[a-z0-9]{24}$/);

/**
 * Arbitrary for generating FREE tier users with positive credits
 */
const freeUserWithCreditsArb = fc.record({
  id: userIdArb,
  tier: fc.constant('FREE' as const),
  credits: fc.integer({ min: 1, max: 100 }),
  version: fc.integer({ min: 0, max: 1000 }),
});

/**
 * Arbitrary for generating version offsets that create mismatches
 */
const versionOffsetArb = fc.integer({ min: 1, max: 100 });

describe('Property 21: OCC conflict returns correct error', () => {
  beforeEach(() => {
    mockUsers = new Map();
    updateManyCalls = [];
    vi.clearAllMocks();
  });

  /**
   * Main Property Test: For any credit decrement where version has changed,
   * the operation SHALL return success: false indicating a conflict.
   * 
   * This validates Requirements 6.8
   */
  it('should return failure when version mismatch occurs (OCC conflict)', async () => {
    await fc.assert(
      fc.asyncProperty(
        freeUserWithCreditsArb,
        versionOffsetArb,
        async (user, versionOffset) => {
          // Reset state for each property iteration
          mockUsers.clear();
          updateManyCalls = [];
          
          // Setup: Add user to mock database
          const originalCredits = user.credits;
          const originalVersion = user.version;
          mockUsers.set(user.id, { ...user });
          
          // Calculate a stale version (simulating concurrent modification)
          const staleVersion = originalVersion - versionOffset;
          
          // Precondition: stale version must be different and non-negative
          fc.pre(staleVersion >= 0 && staleVersion !== originalVersion);
          
          // Execute: Try to decrement with stale version
          const result = await decrementCredits(user.id, staleVersion);
          
          // Property: Operation MUST fail due to version mismatch
          expect(result.success).toBe(false);
          
          // Property: Credits MUST NOT be decremented
          const unchangedUser = mockUsers.get(user.id);
          expect(unchangedUser?.credits).toBe(originalCredits);
          
          // Property: Version MUST NOT be incremented
          expect(unchangedUser?.version).toBe(originalVersion);
          
          // Property: updateMany MUST have been called with version check
          expect(updateManyCalls.length).toBeGreaterThan(0);
          const updateCall = updateManyCalls[0];
          expect(updateCall?.where.version).toBe(staleVersion);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property: Concurrent modifications with same stale version both fail.
   * This simulates a race condition where two requests read the same version.
   */
  it('should fail both concurrent requests using same stale version', async () => {
    await fc.assert(
      fc.asyncProperty(
        freeUserWithCreditsArb.filter(u => u.credits >= 2),
        async (user) => {
          // Reset state for each property iteration
          mockUsers.clear();
          updateManyCalls = [];
          
          // Setup: Add user to mock database
          const originalCredits = user.credits;
          const originalVersion = user.version;
          mockUsers.set(user.id, { ...user });
          
          // Execute: First request succeeds with correct version
          const result1 = await decrementCredits(user.id, originalVersion);
          expect(result1.success).toBe(true);
          
          // Execute: Second request with SAME (now stale) version fails
          updateManyCalls = [];
          const result2 = await decrementCredits(user.id, originalVersion);
          
          // Property: Second request MUST fail (OCC conflict)
          expect(result2.success).toBe(false);
          
          // Property: Credits should only be decremented once
          const finalUser = mockUsers.get(user.id);
          expect(finalUser?.credits).toBe(originalCredits - 1);
          
          // Property: Version should only be incremented once
          expect(finalUser?.version).toBe(originalVersion + 1);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property: Version mismatch in either direction causes conflict.
   * Tests both stale (lower) and future (higher) version mismatches.
   */
  it('should fail when provided version differs from current version in any direction', async () => {
    await fc.assert(
      fc.asyncProperty(
        freeUserWithCreditsArb,
        fc.integer({ min: -50, max: 50 }).filter(offset => offset !== 0),
        async (user, versionOffset) => {
          // Reset state for each property iteration
          mockUsers.clear();
          updateManyCalls = [];
          
          // Setup: Add user to mock database
          const originalCredits = user.credits;
          const originalVersion = user.version;
          mockUsers.set(user.id, { ...user });
          
          // Calculate mismatched version (could be higher or lower)
          const mismatchedVersion = originalVersion + versionOffset;
          
          // Precondition: version must be non-negative
          fc.pre(mismatchedVersion >= 0);
          
          // Execute: Try to decrement with mismatched version
          const result = await decrementCredits(user.id, mismatchedVersion);
          
          // Property: Operation MUST fail due to version mismatch
          expect(result.success).toBe(false);
          
          // Property: Database state MUST remain unchanged
          const unchangedUser = mockUsers.get(user.id);
          expect(unchangedUser?.credits).toBe(originalCredits);
          expect(unchangedUser?.version).toBe(originalVersion);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property: Multiple sequential conflicts all fail correctly.
   * Tests that repeated attempts with stale version all fail.
   */
  it('should consistently fail all attempts with stale version', async () => {
    await fc.assert(
      fc.asyncProperty(
        freeUserWithCreditsArb,
        fc.integer({ min: 2, max: 5 }), // Number of retry attempts
        async (user, retryCount) => {
          // Reset state for each property iteration
          mockUsers.clear();
          updateManyCalls = [];
          
          // Setup: Add user to mock database
          const originalCredits = user.credits;
          const originalVersion = user.version;
          mockUsers.set(user.id, { ...user });
          
          // First: Successful decrement to create version mismatch
          const successResult = await decrementCredits(user.id, originalVersion);
          expect(successResult.success).toBe(true);
          
          // Execute: Multiple retry attempts with stale version
          const failedResults: boolean[] = [];
          for (let i = 0; i < retryCount; i++) {
            const result = await decrementCredits(user.id, originalVersion);
            failedResults.push(result.success);
          }
          
          // Property: ALL retry attempts MUST fail
          expect(failedResults.every(success => success === false)).toBe(true);
          
          // Property: Credits should only be decremented once (from first success)
          const finalUser = mockUsers.get(user.id);
          expect(finalUser?.credits).toBe(originalCredits - 1);
          
          // Property: Version should only be incremented once
          expect(finalUser?.version).toBe(originalVersion + 1);
        }
      ),
      { numRuns: 100 }
    );
  });
});
