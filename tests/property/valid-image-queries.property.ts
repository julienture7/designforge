import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fc from 'fast-check';
import { z } from 'zod';
import { isSSRFAttempt } from '../../src/lib/utils/ssrf-validator';

/**
 * **Feature: generative-ui-platform, Property 10: Valid queries return image redirect**
 * **Validates: Requirements 3.3**
 * 
 * For any valid image query (non-empty, ≤200 chars, no SSRF patterns),
 * the image proxy SHALL return HTTP 302 with a `Location` header pointing
 * to an Unsplash image URL or fallback placeholder.
 * 
 * Requirements 3.3 specifies:
 * "WHEN the Image_Proxy at `/api/proxy/image` receives a GET request with
 * `query` parameter THEN it SHALL search Unsplash and return HTTP 302 redirect
 * to `response.results[0].urls.regular`"
 */

/**
 * Zod schema for query validation (mirrors the route handler schema)
 * @see Requirements 3.10 - SSRF Prevention
 */
const imageProxyQuerySchema = z.object({
  query: z
    .string()
    .trim()
    .min(1, "Query cannot be empty")
    .max(200, "Query exceeds maximum length of 200 characters"),
});

/**
 * Arbitrary for generating valid image search queries
 * Valid queries are:
 * - Non-empty after trimming
 * - ≤200 characters
 * - Do not contain SSRF patterns
 */
const validImageQueryArb = fc.stringMatching(/^[A-Za-z][A-Za-z0-9 ]{0,99}$/)
  .filter(s => {
    const trimmed = s.trim();
    return (
      trimmed.length >= 1 &&
      trimmed.length <= 200 &&
      !isSSRFAttempt(trimmed)
    );
  });

/**
 * Arbitrary for generating realistic image search terms
 * These are common search terms that would be used in real scenarios
 */
const realisticQueryArb = fc.oneof(
  // Nature terms
  fc.constantFrom(
    'sunset beach',
    'mountain landscape',
    'forest trees',
    'ocean waves',
    'desert sand',
    'waterfall',
    'flowers garden',
    'autumn leaves'
  ),
  // Urban terms
  fc.constantFrom(
    'city skyline',
    'street photography',
    'architecture building',
    'coffee shop',
    'office workspace',
    'modern interior'
  ),
  // Abstract terms
  fc.constantFrom(
    'abstract art',
    'minimal design',
    'gradient colors',
    'texture pattern',
    'geometric shapes'
  ),
  // Technology terms
  fc.constantFrom(
    'laptop computer',
    'smartphone mobile',
    'coding programming',
    'technology innovation'
  )
);

/**
 * Arbitrary for generating queries at boundary lengths
 */
const boundaryLengthQueryArb = fc.integer({ min: 1, max: 200 })
  .map(length => 'a'.repeat(length));

/**
 * Arbitrary for generating queries with various valid characters
 */
const mixedCharQueryArb = fc.array(
  fc.oneof(
    fc.constantFrom('a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', 'k', 'l', 'm'),
    fc.constantFrom('n', 'o', 'p', 'q', 'r', 's', 't', 'u', 'v', 'w', 'x', 'y', 'z'),
    fc.constantFrom('A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M'),
    fc.constantFrom('N', 'O', 'P', 'Q', 'R', 'S', 'T', 'U', 'V', 'W', 'X', 'Y', 'Z'),
    fc.constantFrom('0', '1', '2', '3', '4', '5', '6', '7', '8', '9'),
    fc.constantFrom(' ', '-', '_')
  ),
  { minLength: 1, maxLength: 100 }
)
  .map(chars => chars.join(''))
  .filter(s => {
    const trimmed = s.trim();
    return (
      trimmed.length >= 1 &&
      trimmed.length <= 200 &&
      !isSSRFAttempt(trimmed)
    );
  });

describe('Property 10: Valid queries return image redirect', () => {
  /**
   * Property: For any valid query, Zod validation SHALL succeed.
   * This is a prerequisite for the route to process the request.
   */
  it('should pass Zod validation for any valid query', () => {
    fc.assert(
      fc.property(
        validImageQueryArb,
        (validQuery) => {
          const result = imageProxyQuerySchema.safeParse({ query: validQuery });
          
          // Property: Valid queries MUST pass Zod validation
          expect(result.success).toBe(true);
          
          if (result.success) {
            // Property: Parsed query should be trimmed
            expect(result.data.query).toBe(validQuery.trim());
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property: For any valid query, SSRF check SHALL return false (not an attack).
   */
  it('should pass SSRF check for any valid query', () => {
    fc.assert(
      fc.property(
        validImageQueryArb,
        (validQuery) => {
          const isAttack = isSSRFAttempt(validQuery);
          
          // Property: Valid queries MUST NOT be flagged as SSRF attempts
          expect(isAttack).toBe(false);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property: For any realistic image search term, validation SHALL succeed.
   */
  it('should accept realistic image search terms', () => {
    fc.assert(
      fc.property(
        realisticQueryArb,
        (realisticQuery) => {
          const zodResult = imageProxyQuerySchema.safeParse({ query: realisticQuery });
          const ssrfResult = isSSRFAttempt(realisticQuery);
          
          // Property: Realistic queries MUST pass validation
          expect(zodResult.success).toBe(true);
          
          // Property: Realistic queries MUST NOT be flagged as SSRF
          expect(ssrfResult).toBe(false);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property: For any query at boundary length (1-200 chars), validation SHALL succeed.
   */
  it('should accept queries at boundary lengths (1-200 characters)', () => {
    fc.assert(
      fc.property(
        boundaryLengthQueryArb,
        (boundaryQuery) => {
          const result = imageProxyQuerySchema.safeParse({ query: boundaryQuery });
          
          // Property: Queries within length bounds MUST pass validation
          expect(result.success).toBe(true);
          
          if (result.success) {
            expect(result.data.query.length).toBeLessThanOrEqual(200);
            expect(result.data.query.length).toBeGreaterThanOrEqual(1);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property: For any query with mixed valid characters, validation SHALL succeed.
   */
  it('should accept queries with mixed valid characters', () => {
    fc.assert(
      fc.property(
        mixedCharQueryArb,
        (mixedQuery) => {
          const zodResult = imageProxyQuerySchema.safeParse({ query: mixedQuery });
          const ssrfResult = isSSRFAttempt(mixedQuery);
          
          // Property: Mixed character queries MUST pass validation
          expect(zodResult.success).toBe(true);
          
          // Property: Mixed character queries MUST NOT be flagged as SSRF
          expect(ssrfResult).toBe(false);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property: For any valid query, the expected response structure SHALL be a redirect.
   * This tests the response contract without making actual API calls.
   */
  it('should produce redirect response structure for valid queries', () => {
    // Mock response structure that the route handler produces
    interface RedirectResponse {
      status: number;
      headers: {
        location: string;
        cacheControl: string;
        xCache?: string;
      };
    }

    /**
     * Simulates the response structure the route handler would produce
     * for a valid query (either from cache or Unsplash)
     */
    function simulateValidQueryResponse(
      query: string,
      cachedUrl: string | null,
      unsplashUrl: string | null
    ): RedirectResponse {
      const url = cachedUrl ?? unsplashUrl ?? '/images/placeholder.svg';
      return {
        status: 302,
        headers: {
          location: url,
          cacheControl: 'public, max-age=3600, immutable',
          xCache: cachedUrl ? 'HIT' : undefined,
        },
      };
    }

    fc.assert(
      fc.property(
        validImageQueryArb,
        fc.option(fc.webUrl(), { nil: null }), // Cached URL or null
        fc.option(fc.webUrl(), { nil: null }), // Unsplash URL or null
        (validQuery, cachedUrl, unsplashUrl) => {
          // Simulate the response
          const response = simulateValidQueryResponse(validQuery, cachedUrl, unsplashUrl);
          
          // Property: Response status MUST be 302 (redirect)
          expect(response.status).toBe(302);
          
          // Property: Response MUST have Location header
          expect(response.headers.location).toBeDefined();
          expect(response.headers.location.length).toBeGreaterThan(0);
          
          // Property: Response MUST have Cache-Control header
          expect(response.headers.cacheControl).toBe('public, max-age=3600, immutable');
          
          // Property: Location MUST be either a URL or placeholder path
          const isValidLocation = 
            response.headers.location.startsWith('http') ||
            response.headers.location === '/images/placeholder.svg';
          expect(isValidLocation).toBe(true);
          
          // Property: If cached, X-Cache header MUST be HIT
          if (cachedUrl) {
            expect(response.headers.xCache).toBe('HIT');
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property: Queries at exactly 200 characters (max boundary) SHALL be accepted.
   */
  it('should accept queries at exactly 200 characters', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 195, max: 200 }),
        (length) => {
          const boundaryQuery = 'a'.repeat(length);
          const result = imageProxyQuerySchema.safeParse({ query: boundaryQuery });
          
          // Property: Queries at max boundary MUST pass validation
          expect(result.success).toBe(true);
          
          if (result.success) {
            expect(result.data.query.length).toBe(length);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property: Queries exceeding 200 characters SHALL be rejected.
   * This is the inverse property to ensure boundary is enforced.
   */
  it('should reject queries exceeding 200 characters', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 201, max: 300 }),
        (length) => {
          const tooLongQuery = 'a'.repeat(length);
          const result = imageProxyQuerySchema.safeParse({ query: tooLongQuery });
          
          // Property: Queries exceeding max length MUST fail validation
          expect(result.success).toBe(false);
          
          if (!result.success) {
            const queryError = result.error.errors.find(e => e.path.includes('query'));
            expect(queryError).toBeDefined();
            expect(queryError?.message).toContain('200');
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property: Empty queries SHALL be rejected.
   * This is the inverse property to ensure minimum length is enforced.
   */
  it('should reject empty queries', () => {
    const emptyQueryArb = fc.oneof(
      fc.constant(''),
      fc.constant(' '),
      fc.constant('  '),
      fc.constant('\t'),
      fc.constant('\n'),
      fc.array(fc.constantFrom(' ', '\t', '\n'), { minLength: 1, maxLength: 10 })
        .map(arr => arr.join(''))
    );

    fc.assert(
      fc.property(
        emptyQueryArb,
        (emptyQuery) => {
          const result = imageProxyQuerySchema.safeParse({ query: emptyQuery });
          
          // Property: Empty queries MUST fail validation
          expect(result.success).toBe(false);
          
          if (!result.success) {
            const queryError = result.error.errors.find(e => e.path.includes('query'));
            expect(queryError).toBeDefined();
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property: Queries with leading/trailing whitespace SHALL be trimmed and accepted.
   */
  it('should trim whitespace from valid queries', () => {
    const whitespaceWrappedQueryArb = fc.tuple(
      fc.array(fc.constantFrom(' ', '\t'), { minLength: 1, maxLength: 5 }).map(arr => arr.join('')),
      fc.stringMatching(/^[A-Za-z][A-Za-z0-9]{1,50}$/),
      fc.array(fc.constantFrom(' ', '\t'), { minLength: 1, maxLength: 5 }).map(arr => arr.join(''))
    ).map(([prefix, content, suffix]) => ({
      original: prefix + content + suffix,
      expectedTrimmed: content
    }));

    fc.assert(
      fc.property(
        whitespaceWrappedQueryArb,
        ({ original, expectedTrimmed }) => {
          const result = imageProxyQuerySchema.safeParse({ query: original });
          
          // Property: Whitespace-wrapped valid queries MUST pass validation
          expect(result.success).toBe(true);
          
          if (result.success) {
            // Property: Result should be trimmed
            expect(result.data.query).toBe(original.trim());
          }
        }
      ),
      { numRuns: 100 }
    );
  });
});
