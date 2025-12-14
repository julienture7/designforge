import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as fc from 'fast-check';

/**
 * **Feature: generative-ui-platform, Property 19: Pro tier bypasses credit checks**
 * **Validates: Requirements 6.5**
 * 
 * For any PRO tier user, generation requests SHALL proceed without checking or
 * decrementing credits, regardless of the `credits` field value.
 * 
 * Requirements 6.5 specifies:
 * "WHILE `user.tier === 'PRO'` THEN the Credit_System SHALL skip all credit checks
 * and allow unlimited generations"
 */

// Mock database state
let mockUsers: Map<string, { id: string; tier: 'FREE' | 'PRO'; credits: number; version: number }>;

// Track if Gemini API was called
let geminiApiCalled: boolean;

// Track if credits were decremented
let creditsDecremented: boolean;

// Mock the database module
vi.mock('~/server/db', () => {
  return {
    db: {
      user: {
        findUnique: vi.fn(async ({ where }: { where: { id: string } }) => {
          return mockUsers.get(where.id) ?? null;
        }),
        updateMany: vi.fn(async () => {
          creditsDecremented = true;
          return { count: 1 };
        }),
      },
    },
  };
});

// Import after mocking
import { checkCredits } from '~/server/services/credit.service';

/**
 * Error codes as defined in the Global Error Dictionary
 */
type ErrorCode = 
  | 'UNAUTHORIZED'
  | 'CREDITS_EXHAUSTED'
  | 'GENERATION_IN_PROGRESS'
  | 'CONFLICT';

/**
 * API Error Response structure as defined in the design document
 */
interface ApiErrorResponse {
  success: false;
  error: {
    code: ErrorCode;
    message: string;
    correlationId?: string;
  };
}

/**
 * Simulates the generation request handler behavior for PRO tier users.
 * This mirrors what the actual /api/generate route handler should do.
 * 
 * @param userId - The user making the generation request
 * @returns HTTP status code and response body
 */
async function handleGenerationRequest(userId: string): Promise<{
  status: number;
  body: ApiErrorResponse | { success: true };
  geminiCalled: boolean;
  creditsChecked: boolean;
}> {
  // Reset trackers
  geminiApiCalled = false;
  creditsDecremented = false;
  
  // Check credits (PRO tier should bypass)
  const creditCheck = await checkCredits(userId);
  
  if (!creditCheck.allowed) {
    // This should NEVER happen for PRO users
    return {
      status: 402,
      body: {
        success: false,
        error: {
          code: 'CREDITS_EXHAUSTED',
          message: "You've used all your free generations today. Upgrade to Pro for unlimited access",
        },
      },
      geminiCalled: false,
      creditsChecked: true,
    };
  }
  
  // PRO tier users proceed to generation
  geminiApiCalled = true;
  
  return {
    status: 200,
    body: { success: true },
    geminiCalled: true,
    creditsChecked: true,
  };
}

/**
 * Arbitrary for generating valid user IDs (CUID format)
 * CUIDs are 25 characters starting with 'c'
 */
const userIdArb = fc.stringMatching(/^c[a-z0-9]{24}$/);

/**
 * Arbitrary for generating PRO tier users with zero credits
 * This tests the key property: PRO users bypass credit checks even with 0 credits
 */
const proUserZeroCreditsArb = fc.record({
  id: userIdArb,
  tier: fc.constant('PRO' as const),
  credits: fc.constant(0),
  version: fc.integer({ min: 0, max: 1000 }),
});

/**
 * Arbitrary for generating PRO tier users with any credit value (including negative edge cases)
 * This tests that PRO users can generate regardless of credits field value
 */
const proUserAnyCreditsArb = fc.record({
  id: userIdArb,
  tier: fc.constant('PRO' as const),
  credits: fc.integer({ min: -100, max: 100 }), // Include negative to test edge cases
  version: fc.integer({ min: 0, max: 1000 }),
});

/**
 * Arbitrary for generating PRO tier users with positive credits
 */
const proUserPositiveCreditsArb = fc.record({
  id: userIdArb,
  tier: fc.constant('PRO' as const),
  credits: fc.integer({ min: 1, max: 100 }),
  version: fc.integer({ min: 0, max: 1000 }),
});

/**
 * Arbitrary for generating FREE tier users with zero credits (for comparison)
 */
const freeUserZeroCreditsArb = fc.record({
  id: userIdArb,
  tier: fc.constant('FREE' as const),
  credits: fc.constant(0),
  version: fc.integer({ min: 0, max: 1000 }),
});

describe('Property 19: Pro tier bypasses credit checks', () => {
  beforeEach(() => {
    // Reset mock state before each test
    mockUsers = new Map();
    geminiApiCalled = false;
    creditsDecremented = false;
    vi.clearAllMocks();
  });

  /**
   * Main Property Test: For any PRO tier user, generation SHALL succeed
   * regardless of the credits field value.
   * 
   * This validates Requirements 6.5
   */
  it('should allow generation for PRO users regardless of credits value', async () => {
    await fc.assert(
      fc.asyncProperty(
        proUserAnyCreditsArb,
        async (user) => {
          // Setup: Add user to mock database
          mockUsers.set(user.id, user);
          
          // Execute: Attempt generation
          const response = await handleGenerationRequest(user.id);
          
          // Property: Status MUST be 200 (OK) for PRO users
          expect(response.status).toBe(200);
          
          // Property: Response MUST indicate success
          expect(response.body.success).toBe(true);
          
          // Property: Gemini API MUST be called
          expect(response.geminiCalled).toBe(true);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property: PRO tier users with zero credits SHALL still be allowed to generate.
   * This is the critical edge case that validates the bypass behavior.
   */
  it('should allow generation for PRO users with zero credits', async () => {
    await fc.assert(
      fc.asyncProperty(
        proUserZeroCreditsArb,
        async (user) => {
          // Setup: Add user to mock database
          mockUsers.set(user.id, user);
          
          // Execute: Attempt generation
          const response = await handleGenerationRequest(user.id);
          
          // Property: Status MUST be 200 (OK) even with 0 credits
          expect(response.status).toBe(200);
          
          // Property: Response MUST indicate success
          expect(response.body.success).toBe(true);
          
          // Property: Gemini API MUST be called
          expect(response.geminiCalled).toBe(true);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property: PRO tier users with positive credits SHALL be allowed to generate.
   * This ensures normal PRO user flow works correctly.
   */
  it('should allow generation for PRO users with positive credits', async () => {
    await fc.assert(
      fc.asyncProperty(
        proUserPositiveCreditsArb,
        async (user) => {
          // Setup: Add user to mock database
          mockUsers.set(user.id, user);
          
          // Execute: Attempt generation
          const response = await handleGenerationRequest(user.id);
          
          // Property: Status MUST be 200 (OK)
          expect(response.status).toBe(200);
          
          // Property: Response MUST indicate success
          expect(response.body.success).toBe(true);
          
          // Property: Gemini API MUST be called
          expect(response.geminiCalled).toBe(true);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property: Multiple generation attempts from PRO user SHALL all succeed.
   * This ensures unlimited generations for PRO tier.
   */
  it('should allow unlimited generations for PRO users', async () => {
    await fc.assert(
      fc.asyncProperty(
        proUserZeroCreditsArb,
        fc.integer({ min: 2, max: 10 }),
        async (user, attemptCount) => {
          // Setup: Add user to mock database
          mockUsers.set(user.id, user);
          
          // Execute: Multiple generation attempts
          for (let i = 0; i < attemptCount; i++) {
            const response = await handleGenerationRequest(user.id);
            
            // Property: Every attempt MUST return 200
            expect(response.status).toBe(200);
            
            // Property: Every attempt MUST succeed
            expect(response.body.success).toBe(true);
            
            // Property: Gemini API MUST be called on every attempt
            expect(response.geminiCalled).toBe(true);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property: PRO tier behavior SHALL differ from FREE tier with zero credits.
   * This validates the tier-based differentiation.
   */
  it('should differentiate PRO tier from FREE tier with zero credits', async () => {
    await fc.assert(
      fc.asyncProperty(
        proUserZeroCreditsArb,
        freeUserZeroCreditsArb,
        async (proUser, freeUser) => {
          // Ensure different user IDs
          fc.pre(proUser.id !== freeUser.id);
          
          // Setup: Add both users to mock database
          mockUsers.set(proUser.id, proUser);
          mockUsers.set(freeUser.id, freeUser);
          
          // Execute: PRO user attempts generation
          const proResponse = await handleGenerationRequest(proUser.id);
          
          // Property: PRO user with 0 credits MUST succeed
          expect(proResponse.status).toBe(200);
          expect(proResponse.body.success).toBe(true);
          expect(proResponse.geminiCalled).toBe(true);
          
          // Execute: FREE user attempts generation
          const freeResponse = await handleGenerationRequest(freeUser.id);
          
          // Property: FREE user with 0 credits MUST be blocked
          expect(freeResponse.status).toBe(402);
          expect(freeResponse.body.success).toBe(false);
          if (!freeResponse.body.success) {
            expect(freeResponse.body.error.code).toBe('CREDITS_EXHAUSTED');
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property: checkCredits function SHALL return allowed=true for PRO users.
   * This tests the credit service directly.
   */
  it('should return allowed=true from checkCredits for PRO users', async () => {
    await fc.assert(
      fc.asyncProperty(
        proUserAnyCreditsArb,
        async (user) => {
          // Setup: Add user to mock database
          mockUsers.set(user.id, user);
          
          // Execute: Check credits directly
          const result = await checkCredits(user.id);
          
          // Property: allowed MUST be true for PRO users
          expect(result.allowed).toBe(true);
          
          // Property: tier MUST be PRO
          expect(result.tier).toBe('PRO');
        }
      ),
      { numRuns: 100 }
    );
  });
});
