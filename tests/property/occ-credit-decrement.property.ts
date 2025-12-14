import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as fc from 'fast-check';

/**
 * **Feature: generative-ui-platform, Property 18: Credit decrement uses optimistic concurrency**
 * **Validates: Requirements 6.2**
 * 
 * For any successful generation by a FREE tier user, the credit decrement operation
 * SHALL use the OCC pattern: `UPDATE ... WHERE version = currentVersion` and increment version.
 * 
 * Requirements 6.2 specifies:
 * "WHEN a generation completes successfully THEN the Credit_System SHALL decrement credits using OCC pattern:
 * const result = await prisma.user.updateMany({
 *   where: { id: userId, credits: { gt: 0 }, version: user.version },
 *   data: { credits: { decrement: 1 }, version: { increment: 1 } }
 * });
 * if (result.count === 0) throw new TRPCError({ code: 'CONFLICT' });"
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
        // Create a transaction mock that tracks updateMany calls
        const txMock = {
          user: {
            updateMany: vi.fn(async (args: {
              where: { id: string; credits?: { gt: number }; version?: number };
              data: { credits?: { decrement: number }; version?: { increment: number } };
            }) => {
              // Track the call for verification
              updateManyCalls.push(args);
              
              const user = mockUsers.get(args.where.id);
              if (!user) return { count: 0 };
              
              // Check OCC conditions
              const versionMatches = args.where.version === undefined || args.where.version === user.version;
              const hasCredits = args.where.credits?.gt === undefined || user.credits > (args.where.credits.gt);
              
              if (versionMatches && hasCredits) {
                // Apply the update
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
import { decrementCredits, checkCredits } from '~/server/services/credit.service';

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

describe('Property 18: Credit decrement uses optimistic concurrency', () => {
  beforeEach(() => {
    // Reset mock state before each test
    mockUsers = new Map();
    updateManyCalls = [];
    vi.clearAllMocks();
  });

  /**
   * Main Property Test: For any credit decrement operation, the updateMany call
   * SHALL include version check in WHERE clause and version increment in data.
   * 
   * This validates Requirements 6.2
   */
  it('should use OCC pattern with version check and increment', async () => {
    await fc.assert(
      fc.asyncProperty(
        freeUserWithCreditsArb,
        async (user) => {
          // Reset state for each property iteration
          mockUsers.clear();
          updateManyCalls = [];
          
          // Setup: Add user to mock database
          mockUsers.set(user.id, { ...user });
          const originalVersion = user.version;
          
          // Execute: Decrement credits with current version
          const result = await decrementCredits(user.id, originalVersion);
          
          // Property: Operation should succeed when version matches
          expect(result.success).toBe(true);
          
          // Property: updateMany MUST have been called
          expect(updateManyCalls.length).toBeGreaterThan(0);
          
          // Get the updateMany call
          const updateCall = updateManyCalls[0];
          
          // Property: WHERE clause MUST include version check (OCC pattern)
          expect(updateCall?.where.version).toBe(originalVersion);
          
          // Property: WHERE clause MUST include credits > 0 check
          expect(updateCall?.where.credits).toEqual({ gt: 0 });
          
          // Property: WHERE clause MUST include user ID
          expect(updateCall?.where.id).toBe(user.id);
          
          // Property: Data MUST include version increment
          expect(updateCall?.data.version).toEqual({ increment: 1 });
          
          // Property: Data MUST include credits decrement
          expect(updateCall?.data.credits).toEqual({ decrement: 1 });
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property: When version matches, credits SHALL be decremented by 1 and version incremented by 1.
   */
  it('should decrement credits and increment version on successful OCC update', async () => {
    await fc.assert(
      fc.asyncProperty(
        freeUserWithCreditsArb,
        async (user) => {
          // Reset state for each property iteration
          mockUsers.clear();
          updateManyCalls = [];
          
          // Setup: Add user to mock database
          const originalCredits = user.credits;
          const originalVersion = user.version;
          mockUsers.set(user.id, { ...user });
          
          // Execute: Decrement credits
          const result = await decrementCredits(user.id, originalVersion);
          
          // Property: Operation should succeed
          expect(result.success).toBe(true);
          
          // Property: New credits should be original - 1
          expect(result.newCredits).toBe(originalCredits - 1);
          
          // Property: New version should be original + 1
          expect(result.newVersion).toBe(originalVersion + 1);
          
          // Property: Database state should reflect the changes
          const updatedUser = mockUsers.get(user.id);
          expect(updatedUser?.credits).toBe(originalCredits - 1);
          expect(updatedUser?.version).toBe(originalVersion + 1);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property: When version does NOT match (concurrent modification), operation SHALL fail.
   * This tests the OCC conflict detection.
   */
  it('should fail when version does not match (OCC conflict)', async () => {
    await fc.assert(
      fc.asyncProperty(
        freeUserWithCreditsArb,
        fc.integer({ min: 1, max: 100 }), // Version offset to create mismatch
        async (user, versionOffset) => {
          // Reset state for each property iteration
          mockUsers.clear();
          updateManyCalls = [];
          
          // Setup: Add user to mock database
          const originalCredits = user.credits;
          const originalVersion = user.version;
          mockUsers.set(user.id, { ...user });
          
          // Execute: Try to decrement with wrong version (simulating concurrent modification)
          const staleVersion = originalVersion - versionOffset;
          // Ensure stale version is different and non-negative
          fc.pre(staleVersion >= 0 && staleVersion !== originalVersion);
          
          const result = await decrementCredits(user.id, staleVersion);
          
          // Property: Operation should fail due to version mismatch
          expect(result.success).toBe(false);
          
          // Property: Credits should NOT be decremented
          const unchangedUser = mockUsers.get(user.id);
          expect(unchangedUser?.credits).toBe(originalCredits);
          
          // Property: Version should NOT be incremented
          expect(unchangedUser?.version).toBe(originalVersion);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property: Sequential decrements SHALL each increment version, preventing double-spend.
   */
  it('should prevent double-spend through sequential version increments', async () => {
    await fc.assert(
      fc.asyncProperty(
        freeUserWithCreditsArb.filter(u => u.credits >= 2), // Need at least 2 credits
        async (user) => {
          // Reset state for each property iteration
          mockUsers.clear();
          updateManyCalls = [];
          
          // Setup: Add user to mock database
          const originalCredits = user.credits;
          const originalVersion = user.version;
          mockUsers.set(user.id, { ...user });
          
          // Execute: First decrement with original version
          const result1 = await decrementCredits(user.id, originalVersion);
          
          // Property: First decrement should succeed
          expect(result1.success).toBe(true);
          expect(result1.newVersion).toBe(originalVersion + 1);
          
          // Execute: Second decrement with SAME original version (simulating race condition)
          updateManyCalls = []; // Reset to track second call
          const result2 = await decrementCredits(user.id, originalVersion);
          
          // Property: Second decrement with stale version should FAIL
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
   * Property: Decrement with correct updated version SHALL succeed after first decrement.
   */
  it('should allow sequential decrements with correct version updates', async () => {
    await fc.assert(
      fc.asyncProperty(
        freeUserWithCreditsArb.filter(u => u.credits >= 3), // Need at least 3 credits
        async (user) => {
          // Reset state for each property iteration
          mockUsers.clear();
          updateManyCalls = [];
          
          // Setup: Add user to mock database
          const originalCredits = user.credits;
          const originalVersion = user.version;
          mockUsers.set(user.id, { ...user });
          
          // Execute: First decrement
          const result1 = await decrementCredits(user.id, originalVersion);
          expect(result1.success).toBe(true);
          
          // Execute: Second decrement with UPDATED version
          const result2 = await decrementCredits(user.id, result1.newVersion!);
          expect(result2.success).toBe(true);
          
          // Execute: Third decrement with UPDATED version
          const result3 = await decrementCredits(user.id, result2.newVersion!);
          expect(result3.success).toBe(true);
          
          // Property: Credits should be decremented 3 times
          const finalUser = mockUsers.get(user.id);
          expect(finalUser?.credits).toBe(originalCredits - 3);
          
          // Property: Version should be incremented 3 times
          expect(finalUser?.version).toBe(originalVersion + 3);
        }
      ),
      { numRuns: 100 }
    );
  });
});
