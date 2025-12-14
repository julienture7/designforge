import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as fc from 'fast-check';

/**
 * **Feature: generative-ui-platform, Property 23: Webhook idempotency**
 * **Validates: Requirements 7.7**
 * 
 * For any Stripe webhook with an `event.id` that exists in the `ProcessedWebhook` table,
 * the handler SHALL return HTTP 200 without re-processing the event.
 * 
 * Requirements 7.7 specifies:
 * "WHEN processing valid webhook THEN the Payment_System SHALL:
 *  - Check `ProcessedWebhook.findUnique({ where: { eventId: event.id } })`
 *  - IF exists, return 200 immediately (idempotent)
 *  - IF not exists, process event, then `ProcessedWebhook.create({ eventId: event.id, eventType: event.type })`"
 */

// Track database calls to verify idempotency behavior
let processedWebhookFindUniqueCalls: Array<{ eventId: string }> = [];
let processedWebhookCreateCalls: Array<{ eventId: string; eventType: string }> = [];
let userFindUniqueCalls: Array<{ where: Record<string, unknown> }> = [];
let userUpdateCalls: Array<{ where: Record<string, unknown>; data: Record<string, unknown> }> = [];

// Control whether the webhook has already been processed
let webhookAlreadyProcessed = false;

// Mock the Stripe module
vi.mock('~/server/lib/stripe', () => {
  return {
    stripe: {
      webhooks: {
        constructEvent: vi.fn((body: string, _signature: string, _secret: string) => {
          // Parse the body to get the event data
          const parsed = JSON.parse(body) as {
            id: string;
            type: string;
            data: { object: Record<string, unknown> };
          };
          return {
            id: parsed.id,
            type: parsed.type,
            data: parsed.data,
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
        findUnique: vi.fn(({ where }: { where: { eventId: string } }) => {
          processedWebhookFindUniqueCalls.push({ eventId: where.eventId });
          // Return existing record if webhook was already processed
          if (webhookAlreadyProcessed) {
            return Promise.resolve({
              id: 'pw_existing',
              eventId: where.eventId,
              eventType: 'checkout.session.completed',
              processedAt: new Date(),
            });
          }
          return Promise.resolve(null);
        }),
        create: vi.fn(({ data }: { data: { eventId: string; eventType: string } }) => {
          processedWebhookCreateCalls.push({ eventId: data.eventId, eventType: data.eventType });
          return Promise.resolve({
            id: 'pw_new',
            eventId: data.eventId,
            eventType: data.eventType,
            processedAt: new Date(),
          });
        }),
      },
      user: {
        findUnique: vi.fn((args: { where: Record<string, unknown> }) => {
          userFindUniqueCalls.push({ where: args.where });
          return Promise.resolve({
            id: 'test_user_id',
            email: 'test@example.com',
          });
        }),
        update: vi.fn((args: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
          userUpdateCalls.push({ where: args.where, data: args.data });
          return Promise.resolve({});
        }),
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
function createMockRequest(body: string, signature: string): Request {
  const headers = new Headers();
  headers.set('stripe-signature', signature);
  headers.set('x-forwarded-for', '127.0.0.1');
  
  return new Request('http://localhost:3000/api/webhooks/stripe', {
    method: 'POST',
    headers,
    body,
  });
}

/**
 * Arbitrary for generating valid Stripe event IDs
 */
const stripeEventIdArb = fc.stringMatching(/^evt_[a-zA-Z0-9]{14,24}$/);

/**
 * Arbitrary for generating Stripe event types
 */
const stripeEventTypeArb = fc.constantFrom(
  'checkout.session.completed',
  'customer.subscription.updated',
  'customer.subscription.deleted'
);

/**
 * Arbitrary for generating valid webhook body content
 */
const webhookBodyArb = fc.tuple(stripeEventIdArb, stripeEventTypeArb).map(([eventId, eventType]) => {
  const eventData: Record<string, unknown> = {
    id: eventId,
    type: eventType,
    data: {
      object: {
        id: 'obj_' + Math.random().toString(36).substring(7),
        metadata: { userId: 'test_user_id' },
        client_reference_id: 'test_user_id',
        customer: 'cus_test_123',
        subscription: 'sub_test_123',
        status: 'active',
      },
    },
  };
  return {
    body: JSON.stringify(eventData),
    eventId,
    eventType,
  };
});

/**
 * Helper to generate hex strings (fast-check doesn't have hexaString in all versions)
 */
const hexStringArb = (length: number) => 
  fc.array(fc.integer({ min: 0, max: 15 }), { minLength: length, maxLength: length })
    .map(arr => arr.map(n => n.toString(16)).join(''));

/**
 * Arbitrary for generating valid-looking signatures
 */
const validSignatureArb = fc.tuple(
  fc.integer({ min: 1000000000, max: 9999999999 }),
  hexStringArb(64)
).map(([timestamp, hash]) => `t=${timestamp},v1=${hash}`);

describe('Property 23: Webhook idempotency', () => {
  beforeEach(() => {
    // Reset all tracking arrays
    processedWebhookFindUniqueCalls = [];
    processedWebhookCreateCalls = [];
    userFindUniqueCalls = [];
    userUpdateCalls = [];
    webhookAlreadyProcessed = false;
    vi.clearAllMocks();
  });

  /**
   * Main Property Test: For any webhook with an event.id that already exists
   * in ProcessedWebhook table, the handler SHALL return HTTP 200 without
   * re-processing the event.
   * 
   * This validates Requirements 7.7
   */
  it('should return 200 without re-processing for duplicate event IDs', async () => {
    await fc.assert(
      fc.asyncProperty(
        webhookBodyArb,
        validSignatureArb,
        async ({ body, eventId }, signature) => {
          // Reset state for each property iteration
          processedWebhookFindUniqueCalls = [];
          processedWebhookCreateCalls = [];
          userFindUniqueCalls = [];
          userUpdateCalls = [];
          
          // Set up: Mark webhook as already processed
          webhookAlreadyProcessed = true;
          
          // Create request
          const request = createMockRequest(body, signature);
          
          // Execute: Call the webhook handler
          const response = await POST(request as unknown as import('next/server').NextRequest);
          
          // Property 1: Response MUST be HTTP 200
          expect(response.status).toBe(200);
          
          // Property 2: ProcessedWebhook.findUnique MUST have been called with the event ID
          expect(processedWebhookFindUniqueCalls.length).toBe(1);
          expect(processedWebhookFindUniqueCalls[0]?.eventId).toBe(eventId);
          
          // Property 3: ProcessedWebhook.create MUST NOT have been called (no re-processing)
          expect(processedWebhookCreateCalls.length).toBe(0);
          
          // Property 4: User operations MUST NOT have been called (no re-processing)
          expect(userFindUniqueCalls.length).toBe(0);
          expect(userUpdateCalls.length).toBe(0);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property: Response body indicates duplicate for already-processed webhooks
   */
  it('should indicate duplicate in response body for already-processed webhooks', async () => {
    await fc.assert(
      fc.asyncProperty(
        webhookBodyArb,
        validSignatureArb,
        async ({ body }, signature) => {
          // Reset state for each property iteration
          processedWebhookFindUniqueCalls = [];
          
          // Set up: Mark webhook as already processed
          webhookAlreadyProcessed = true;
          
          // Create request
          const request = createMockRequest(body, signature);
          
          // Execute: Call the webhook handler
          const response = await POST(request as unknown as import('next/server').NextRequest);
          
          // Property: Response MUST be HTTP 200
          expect(response.status).toBe(200);
          
          // Property: Response body MUST indicate duplicate
          const responseBody = await response.json() as { received: boolean; duplicate?: boolean };
          expect(responseBody.received).toBe(true);
          expect(responseBody.duplicate).toBe(true);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property: New webhooks are processed and recorded
   * Ensures that non-duplicate webhooks are properly processed
   */
  it('should process and record new webhooks', async () => {
    await fc.assert(
      fc.asyncProperty(
        webhookBodyArb,
        validSignatureArb,
        async ({ body, eventId, eventType }, signature) => {
          // Reset state for each property iteration
          processedWebhookFindUniqueCalls = [];
          processedWebhookCreateCalls = [];
          userFindUniqueCalls = [];
          userUpdateCalls = [];
          
          // Set up: Mark webhook as NOT processed yet
          webhookAlreadyProcessed = false;
          
          // Create request
          const request = createMockRequest(body, signature);
          
          // Execute: Call the webhook handler
          const response = await POST(request as unknown as import('next/server').NextRequest);
          
          // Property 1: Response MUST be HTTP 200
          expect(response.status).toBe(200);
          
          // Property 2: ProcessedWebhook.findUnique MUST have been called
          expect(processedWebhookFindUniqueCalls.length).toBe(1);
          expect(processedWebhookFindUniqueCalls[0]?.eventId).toBe(eventId);
          
          // Property 3: ProcessedWebhook.create MUST have been called to record the event
          expect(processedWebhookCreateCalls.length).toBe(1);
          expect(processedWebhookCreateCalls[0]?.eventId).toBe(eventId);
          expect(processedWebhookCreateCalls[0]?.eventType).toBe(eventType);
          
          // Property 4: Event processing MUST have occurred (user operations called)
          expect(userFindUniqueCalls.length).toBeGreaterThan(0);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property: Idempotency check happens before event processing
   * Ensures the handler checks for duplicates before doing any work
   */
  it('should check idempotency before processing event', async () => {
    await fc.assert(
      fc.asyncProperty(
        webhookBodyArb,
        validSignatureArb,
        async ({ body, eventId }, signature) => {
          // Reset state for each property iteration
          processedWebhookFindUniqueCalls = [];
          processedWebhookCreateCalls = [];
          userFindUniqueCalls = [];
          userUpdateCalls = [];
          
          // Set up: Mark webhook as already processed
          webhookAlreadyProcessed = true;
          
          // Create request
          const request = createMockRequest(body, signature);
          
          // Execute: Call the webhook handler
          await POST(request as unknown as import('next/server').NextRequest);
          
          // Property: findUnique MUST be called exactly once (idempotency check)
          expect(processedWebhookFindUniqueCalls.length).toBe(1);
          expect(processedWebhookFindUniqueCalls[0]?.eventId).toBe(eventId);
          
          // Property: No event processing should occur after finding duplicate
          expect(userFindUniqueCalls.length).toBe(0);
          expect(userUpdateCalls.length).toBe(0);
          expect(processedWebhookCreateCalls.length).toBe(0);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property: Same event ID always returns 200 on subsequent calls
   * Tests that repeated calls with the same event ID are idempotent
   */
  it('should return 200 for repeated calls with same event ID', async () => {
    await fc.assert(
      fc.asyncProperty(
        webhookBodyArb,
        validSignatureArb,
        fc.integer({ min: 2, max: 5 }),
        async ({ body, eventId }, signature, repeatCount) => {
          // Reset state
          processedWebhookFindUniqueCalls = [];
          processedWebhookCreateCalls = [];
          userFindUniqueCalls = [];
          userUpdateCalls = [];
          
          // First call - webhook not yet processed
          webhookAlreadyProcessed = false;
          
          const request1 = createMockRequest(body, signature);
          const response1 = await POST(request1 as unknown as import('next/server').NextRequest);
          
          // First call should succeed and process
          expect(response1.status).toBe(200);
          const firstCallUserOps = userFindUniqueCalls.length;
          expect(firstCallUserOps).toBeGreaterThan(0);
          
          // Now mark as processed for subsequent calls
          webhookAlreadyProcessed = true;
          
          // Make repeated calls
          for (let i = 0; i < repeatCount; i++) {
            // Reset tracking for this iteration
            userFindUniqueCalls = [];
            userUpdateCalls = [];
            
            const request = createMockRequest(body, signature);
            const response = await POST(request as unknown as import('next/server').NextRequest);
            
            // Property: All subsequent calls MUST return 200
            expect(response.status).toBe(200);
            
            // Property: No user operations should occur on duplicate
            expect(userFindUniqueCalls.length).toBe(0);
            expect(userUpdateCalls.length).toBe(0);
            
            // Property: Response should indicate duplicate
            const responseBody = await response.json() as { duplicate?: boolean };
            expect(responseBody.duplicate).toBe(true);
          }
        }
      ),
      { numRuns: 100 }
    );
  });
});
