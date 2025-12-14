import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as fc from 'fast-check';

/**
 * **Feature: generative-ui-platform, Property 22: Webhook signature verification**
 * **Validates: Requirements 7.5**
 * 
 * For any incoming Stripe webhook request, the handler SHALL call 
 * `stripe.webhooks.constructEvent()` with the request body and signature header 
 * before processing. Invalid signatures SHALL return HTTP 400.
 * 
 * Requirements 7.5 specifies:
 * "WHEN receiving webhook at `/api/webhooks/stripe` THEN the Payment_System SHALL verify signature:
 * const event = stripe.webhooks.constructEvent(body, sig, process.env.STRIPE_WEBHOOK_SECRET);"
 * 
 * Requirements 7.6 specifies:
 * "IF signature verification fails THEN return 400 and log 
 * `{ event: 'webhook_invalid_signature', ip: req.ip, headers }`"
 */

// Track constructEvent calls
let constructEventCalls: Array<{
  body: string;
  signature: string;
  secret: string;
}> = [];

// Control whether signature verification should succeed or fail
let shouldSignatureVerificationFail = false;
let signatureVerificationError: Error | null = null;

// Mock the Stripe module
vi.mock('~/server/lib/stripe', () => {
  return {
    stripe: {
      webhooks: {
        constructEvent: vi.fn((body: string, signature: string, secret: string) => {
          constructEventCalls.push({ body, signature, secret });
          
          if (shouldSignatureVerificationFail) {
            throw signatureVerificationError ?? new Error('Invalid signature');
          }
          
          // Return a mock valid event
          return {
            id: 'evt_test_' + Math.random().toString(36).substring(7),
            type: 'checkout.session.completed',
            data: {
              object: {
                id: 'cs_test_123',
                metadata: { userId: 'test_user_id' },
                client_reference_id: 'test_user_id',
                customer: 'cus_test_123',
                subscription: 'sub_test_123',
              },
            },
          };
        }),
      },
    },
  };
});

// Mock the database
vi.mock('~/server/db', () => {
  return {
    db: {
      processedWebhook: {
        findUnique: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue({}),
      },
      user: {
        findUnique: vi.fn().mockResolvedValue({
          id: 'test_user_id',
          email: 'test@example.com',
        }),
        update: vi.fn().mockResolvedValue({}),
      },
    },
  };
});

// Mock environment variables
vi.mock('~/env', () => {
  return {
    env: {
      STRIPE_WEBHOOK_SECRET: 'whsec_test_secret',
      NODE_ENV: 'test',
    },
  };
});

// Import the route handler after mocking
import { POST } from '~/app/api/webhooks/stripe/route';

/**
 * Helper to create a mock NextRequest
 */
function createMockRequest(body: string, signature: string | null): Request {
  const headers = new Headers();
  if (signature !== null) {
    headers.set('stripe-signature', signature);
  }
  headers.set('x-forwarded-for', '127.0.0.1');
  
  return new Request('http://localhost:3000/api/webhooks/stripe', {
    method: 'POST',
    headers,
    body,
  });
}

/**
 * Arbitrary for generating random webhook body content
 */
const webhookBodyArb = fc.record({
  id: fc.stringMatching(/^evt_[a-zA-Z0-9]{14}$/),
  type: fc.constantFrom(
    'checkout.session.completed',
    'customer.subscription.updated',
    'customer.subscription.deleted'
  ),
  data: fc.record({
    object: fc.record({
      id: fc.string({ minLength: 5, maxLength: 20 }),
      customer: fc.string({ minLength: 5, maxLength: 20 }),
    }),
  }),
}).map(obj => JSON.stringify(obj));

/**
 * Helper to generate hex strings (fast-check doesn't have hexaString)
 */
const hexStringArb = (length: number) => 
  fc.array(fc.integer({ min: 0, max: 15 }), { minLength: length, maxLength: length })
    .map(arr => arr.map(n => n.toString(16)).join(''));

/**
 * Arbitrary for generating invalid signatures (non-empty, non-whitespace)
 * These are signatures that would fail Stripe's verification
 * Note: Empty/whitespace signatures are handled separately as they trigger early return
 */
const invalidSignatureArb = fc.oneof(
  // Random string (not a valid signature format)
  fc.string({ minLength: 1, maxLength: 100 }),
  // Malformed signature (missing parts)
  fc.stringMatching(/^t=[0-9]+$/),
  // Signature with wrong format
  fc.stringMatching(/^v1=[a-f0-9]{64}$/),
  // Completely random bytes
  fc.uint8Array({ minLength: 10, maxLength: 50 }).map(arr => 
    Buffer.from(arr).toString('base64')
  ),
  // Tampered signature (valid format but wrong value)
  fc.tuple(
    fc.integer({ min: 1000000000, max: 9999999999 }),
    hexStringArb(64)
  ).map(([timestamp, hash]) => `t=${timestamp},v1=${hash}`)
).filter(sig => sig.trim().length > 0); // Ensure non-empty, non-whitespace signatures

/**
 * Arbitrary for generating valid-looking but incorrect signatures
 */
const validFormatInvalidSignatureArb = fc.tuple(
  fc.integer({ min: 1000000000, max: 9999999999 }),
  hexStringArb(64)
).map(([timestamp, hash]) => `t=${timestamp},v1=${hash}`);

describe('Property 22: Webhook signature verification', () => {
  beforeEach(() => {
    constructEventCalls = [];
    shouldSignatureVerificationFail = false;
    signatureVerificationError = null;
    vi.clearAllMocks();
  });

  /**
   * Main Property Test: For any webhook request with an invalid signature,
   * the handler SHALL return HTTP 400.
   * 
   * This validates Requirements 7.5, 7.6
   */
  it('should return 400 for any invalid signature', async () => {
    await fc.assert(
      fc.asyncProperty(
        webhookBodyArb,
        invalidSignatureArb,
        async (body, signature) => {
          // Reset state for each property iteration
          constructEventCalls = [];
          shouldSignatureVerificationFail = true;
          signatureVerificationError = new Error('Invalid signature');
          
          // Create request with invalid signature
          const request = createMockRequest(body, signature);
          
          // Execute: Call the webhook handler
          const response = await POST(request as unknown as import('next/server').NextRequest);
          
          // Property: Response MUST be HTTP 400
          expect(response.status).toBe(400);
          
          // Property: constructEvent MUST have been called
          expect(constructEventCalls.length).toBe(1);
          
          // Property: constructEvent MUST have been called with the signature
          expect(constructEventCalls[0]?.signature).toBe(signature);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property: Missing signature header returns 400
   */
  it('should return 400 when signature header is missing', async () => {
    await fc.assert(
      fc.asyncProperty(
        webhookBodyArb,
        async (body) => {
          // Reset state for each property iteration
          constructEventCalls = [];
          
          // Create request WITHOUT signature header
          const request = createMockRequest(body, null);
          
          // Execute: Call the webhook handler
          const response = await POST(request as unknown as import('next/server').NextRequest);
          
          // Property: Response MUST be HTTP 400
          expect(response.status).toBe(400);
          
          // Property: constructEvent should NOT have been called (early return)
          expect(constructEventCalls.length).toBe(0);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property: Valid signature format but wrong value returns 400
   * Tests signatures that look valid but don't match the body
   */
  it('should return 400 for valid-format but incorrect signatures', async () => {
    await fc.assert(
      fc.asyncProperty(
        webhookBodyArb,
        validFormatInvalidSignatureArb,
        async (body, signature) => {
          // Reset state for each property iteration
          constructEventCalls = [];
          shouldSignatureVerificationFail = true;
          signatureVerificationError = new Error(
            'No signatures found matching the expected signature for payload'
          );
          
          // Create request with valid-format but incorrect signature
          const request = createMockRequest(body, signature);
          
          // Execute: Call the webhook handler
          const response = await POST(request as unknown as import('next/server').NextRequest);
          
          // Property: Response MUST be HTTP 400
          expect(response.status).toBe(400);
          
          // Property: constructEvent MUST have been called with correct parameters
          expect(constructEventCalls.length).toBe(1);
          expect(constructEventCalls[0]?.body).toBe(body);
          expect(constructEventCalls[0]?.signature).toBe(signature);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property: Signature verification is called before any event processing
   * Ensures the handler follows the correct order of operations
   */
  it('should call constructEvent before processing any event', async () => {
    await fc.assert(
      fc.asyncProperty(
        webhookBodyArb,
        validFormatInvalidSignatureArb,
        async (body, signature) => {
          // Reset state for each property iteration
          constructEventCalls = [];
          shouldSignatureVerificationFail = false;
          
          // Create request
          const request = createMockRequest(body, signature);
          
          // Execute: Call the webhook handler
          await POST(request as unknown as import('next/server').NextRequest);
          
          // Property: constructEvent MUST have been called exactly once
          expect(constructEventCalls.length).toBe(1);
          
          // Property: constructEvent MUST have been called with the webhook secret
          expect(constructEventCalls[0]?.secret).toBe('whsec_test_secret');
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property: Response body contains error information for invalid signatures
   */
  it('should return error message in response body for invalid signatures', async () => {
    await fc.assert(
      fc.asyncProperty(
        webhookBodyArb,
        invalidSignatureArb,
        async (body, signature) => {
          // Reset state for each property iteration
          constructEventCalls = [];
          shouldSignatureVerificationFail = true;
          signatureVerificationError = new Error('Invalid signature');
          
          // Create request with invalid signature
          const request = createMockRequest(body, signature);
          
          // Execute: Call the webhook handler
          const response = await POST(request as unknown as import('next/server').NextRequest);
          
          // Property: Response MUST be HTTP 400
          expect(response.status).toBe(400);
          
          // Property: Response body MUST contain error information
          const responseBody = await response.json();
          expect(responseBody).toHaveProperty('error');
        }
      ),
      { numRuns: 100 }
    );
  });
});
