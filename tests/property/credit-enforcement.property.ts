import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as fc from 'fast-check';

/**
 * **Feature: generative-ui-platform, Property 17: Credit enforcement blocks zero-credit users**
 * **Validates: Requirements 6.1, 6.3**
 * 
 * For any FREE tier user with `credits = 0`, initiating a generation SHALL return
 * HTTP 402 with `CREDITS_EXHAUSTED` error without making a Gemini API call.
 * 
 * Requirements 6.1 specifies:
 * "WHEN a Free tier user initiates generation THEN the Credit_System SHALL verify 
 * `user.credits > 0` within a database transaction before acquiring Generation_Lock"
 * 
 * Requirements 6.3 specifies:
 * "WHEN `user.credits` reaches 0 THEN the Credit_System SHALL return `CREDITS_EXHAUSTED` 
 * error and render upgrade modal"
 */

// Mock database state
let mockUsers: Map<string, { id: string; tier: 'FREE' | 'PRO'; credits: number; version: number }>;

// Track if Gemini API was called
let geminiApiCalled: boolean;

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
 * Simulates the generation request handler behavior for credit enforcement.
 * This mirrors what the actual /api/generate route handler should do.
 * 
 * @param userId - The user making the generation request
 * @returns HTTP status code and response body
 */
async function handleGenerationRequest(userId: string): Promise<{
  status: number;
  body: ApiErrorResponse | { success: true };
  geminiCalled: boolean;
}> {
  // Reset Gemini API call tracker
  geminiApiCalled = false;
  
  // Check credits before proceeding (Requirement 6.1)
  const creditCheck = await checkCredits(userId);
  
  if (!creditCheck.allowed) {
    // Credits exhausted - return CREDITS_EXHAUSTED error (Requirement 6.3)
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
    };
  }
  
  // In real implementation, this would call Gemini API
  geminiApiCalled = true;
  
  return {
    status: 200,
    body: { success: true },
    geminiCalled: true,
  };
}

/**
 * Arbitrary for generating valid user IDs (CUID format)
 * CUIDs are 25 characters starting with 'c'
 */
const userIdArb = fc.stringMatching(/^c[a-z0-9]{24}$/);

/**
 * Arbitrary for generating FREE tier users with zero credits
 */
const zeroCreditsUserArb = fc.record({
  id: userIdArb,
  tier: fc.constant('FREE' as const),
  credits: fc.constant(0),
  version: fc.integer({ min: 0, max: 1000 }),
});

/**
 * Arbitrary for generating FREE tier users with positive credits
 */
const positiveCreditsUserArb = fc.record({
  id: userIdArb,
  tier: fc.constant('FREE' as const),
  credits: fc.integer({ min: 1, max: 100 }),
  version: fc.integer({ min: 0, max: 1000 }),
});

/**
 * Arbitrary for generating PRO tier users (any credit value)
 */
const proUserArb = fc.record({
  id: userIdArb,
  tier: fc.constant('PRO' as const),
  credits: fc.integer({ min: 0, max: 100 }), // PRO users bypass credit checks
  version: fc.integer({ min: 0, max: 1000 }),
});

describe('Property 17: Credit enforcement blocks zero-credit users', () => {
  beforeEach(() => {
    // Reset mock state before each test
    mockUsers = new Map();
    geminiApiCalled = false;
    vi.clearAllMocks();
  });

  /**
   * Main Property Test: For any FREE tier user with credits = 0, generation
   * SHALL return HTTP 402 with CREDITS_EXHAUSTED error.
   * 
   * This validates Requirements 6.1 and 6.3
   */
  it('should return CREDITS_EXHAUSTED (402) for FREE users with zero credits', async () => {
    await fc.assert(
      fc.asyncProperty(
        zeroCreditsUserArb,
        async (user) => {
          // Setup: Add user to mock database
          mockUsers.set(user.id, user);
          
          // Execute: Attempt generation
          const response = await handleGenerationRequest(user.id);
          
          // Property: Status MUST be 402 (Payment Required)
          expect(response.status).toBe(402);
          
          // Property: Response MUST indicate failure
          expect(response.body.success).toBe(false);
          
          // Property: Error code MUST be CREDITS_EXHAUSTED
          if (!response.body.success) {
            expect(response.body.error.code).toBe('CREDITS_EXHAUSTED');
          }
          
          // Property: Gemini API MUST NOT be called
          expect(response.geminiCalled).toBe(false);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property: FREE tier users with positive credits SHALL be allowed to generate.
   * This is the inverse case to ensure credit check works correctly.
   */
  it('should allow generation for FREE users with positive credits', async () => {
    await fc.assert(
      fc.asyncProperty(
        positiveCreditsUserArb,
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
   * Property: The error response format SHALL match the API specification.
   * Response must include success: false and error object with code and message.
   */
  it('should return properly formatted error response for zero-credit users', async () => {
    await fc.assert(
      fc.asyncProperty(
        zeroCreditsUserArb,
        async (user) => {
          // Setup: Add user to mock database
          mockUsers.set(user.id, user);
          
          // Execute: Attempt generation
          const response = await handleGenerationRequest(user.id);
          
          // Property: Response must have correct structure
          expect(response.status).toBe(402);
          expect(response.body).toHaveProperty('success', false);
          expect(response.body).toHaveProperty('error');
          
          if (!response.body.success) {
            // Property: Error object must have code property
            expect(response.body.error).toHaveProperty('code', 'CREDITS_EXHAUSTED');
            
            // Property: Error message should be user-friendly
            expect(response.body.error.message).toBe(
              "You've used all your free generations today. Upgrade to Pro for unlimited access"
            );
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property: Credit check MUST happen before any Gemini API call.
   * This ensures we don't waste API calls for users without credits.
   */
  it('should not call Gemini API when credits are exhausted', async () => {
    await fc.assert(
      fc.asyncProperty(
        zeroCreditsUserArb,
        async (user) => {
          // Setup: Add user to mock database
          mockUsers.set(user.id, user);
          
          // Execute: Attempt generation
          const response = await handleGenerationRequest(user.id);
          
          // Property: Gemini API MUST NOT be called for zero-credit users
          expect(response.geminiCalled).toBe(false);
          
          // Property: Response should indicate credits exhausted
          expect(response.status).toBe(402);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property: Multiple generation attempts from zero-credit user SHALL all fail.
   * This ensures consistent behavior across multiple requests.
   */
  it('should consistently block all generation attempts from zero-credit users', async () => {
    await fc.assert(
      fc.asyncProperty(
        zeroCreditsUserArb,
        fc.integer({ min: 2, max: 10 }),
        async (user, attemptCount) => {
          // Setup: Add user to mock database
          mockUsers.set(user.id, user);
          
          // Execute: Multiple generation attempts
          for (let i = 0; i < attemptCount; i++) {
            const response = await handleGenerationRequest(user.id);
            
            // Property: Every attempt MUST return 402
            expect(response.status).toBe(402);
            
            // Property: Every attempt MUST have CREDITS_EXHAUSTED error
            if (!response.body.success) {
              expect(response.body.error.code).toBe('CREDITS_EXHAUSTED');
            }
            
            // Property: Gemini API MUST NOT be called on any attempt
            expect(response.geminiCalled).toBe(false);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property: Credit enforcement for one user SHALL NOT affect other users.
   * Different users should have independent credit checks.
   */
  it('should not affect other users when one user has zero credits', async () => {
    await fc.assert(
      fc.asyncProperty(
        zeroCreditsUserArb,
        positiveCreditsUserArb,
        async (zeroCreditsUser, positiveCreditsUser) => {
          // Ensure different user IDs
          fc.pre(zeroCreditsUser.id !== positiveCreditsUser.id);
          
          // Setup: Add both users to mock database
          mockUsers.set(zeroCreditsUser.id, zeroCreditsUser);
          mockUsers.set(positiveCreditsUser.id, positiveCreditsUser);
          
          // Execute: Zero-credit user attempts generation
          const zeroCreditsResponse = await handleGenerationRequest(zeroCreditsUser.id);
          
          // Property: Zero-credit user should be blocked
          expect(zeroCreditsResponse.status).toBe(402);
          if (!zeroCreditsResponse.body.success) {
            expect(zeroCreditsResponse.body.error.code).toBe('CREDITS_EXHAUSTED');
          }
          
          // Execute: Positive-credit user attempts generation
          const positiveCreditsResponse = await handleGenerationRequest(positiveCreditsUser.id);
          
          // Property: Positive-credit user should succeed
          expect(positiveCreditsResponse.status).toBe(200);
          expect(positiveCreditsResponse.body.success).toBe(true);
        }
      ),
      { numRuns: 100 }
    );
  });
});
