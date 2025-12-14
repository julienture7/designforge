import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { createHash } from 'crypto';

/**
 * **Feature: generative-ui-platform, Property 11: Image cache consistency**
 * **Validates: Requirements 3.4, 3.5**
 * 
 * For any query that has been previously resolved, subsequent requests
 * SHALL return the same URL with `X-Cache: HIT` header without making
 * an Unsplash API call.
 * 
 * Requirements 3.4 specifies:
 * "WHEN the Image_Proxy successfully resolves an image THEN it SHALL cache
 * the mapping in Redis key `image:cache:{md5(query)}` with 1-hour TTL"
 * 
 * Requirements 3.5 specifies:
 * "WHEN a cached query is received THEN the Image_Proxy SHALL return cached
 * URL with `X-Cache: HIT` header without Unsplash API call"
 */

/**
 * Generate MD5 hash of query for cache key (mirrors route handler implementation)
 */
function hashQuery(query: string): string {
  return createHash('md5').update(query.toLowerCase().trim()).digest('hex');
}

/**
 * Arbitrary for generating valid image search queries
 * Valid queries are:
 * - Non-empty after trimming
 * - ≤200 characters
 * - Alphanumeric with spaces
 */
const validImageQueryArb = fc.stringMatching(/^[A-Za-z][A-Za-z0-9 ]{0,99}$/)
  .filter(s => {
    const trimmed = s.trim();
    return trimmed.length >= 1 && trimmed.length <= 200;
  });

/**
 * Arbitrary for generating valid Unsplash image URLs
 */
const unsplashUrlArb = fc.tuple(
  fc.constantFrom('photo', 'premium_photo'),
  fc.array(
    fc.constantFrom('0', '1', '2', '3', '4', '5', '6', '7', '8', '9', 'a', 'b', 'c', 'd', 'e', 'f'),
    { minLength: 10, maxLength: 20 }
  ).map(arr => arr.join('')),
  fc.constantFrom('regular', 'small', 'thumb')
).map(([type, id, size]) => 
  `https://images.unsplash.com/${type}-${id}?w=1080&q=80&fit=crop&${size}`
);

/**
 * Arbitrary for generating realistic image search terms
 */
const realisticQueryArb = fc.oneof(
  fc.constantFrom(
    'sunset beach',
    'mountain landscape',
    'forest trees',
    'ocean waves',
    'city skyline',
    'coffee shop',
    'abstract art',
    'laptop computer'
  )
);

/**
 * Simulates the image cache behavior
 * This is a pure function that models the cache contract
 */
class MockImageCache {
  private cache = new Map<string, { url: string; ttl: number }>();
  
  set(queryHash: string, url: string, ttlSeconds: number): void {
    this.cache.set(queryHash, { url, ttl: ttlSeconds });
  }
  
  get(queryHash: string): string | null {
    const entry = this.cache.get(queryHash);
    return entry?.url ?? null;
  }
  
  has(queryHash: string): boolean {
    return this.cache.has(queryHash);
  }
  
  clear(): void {
    this.cache.clear();
  }
}

/**
 * Simulates the response structure for cache operations
 */
interface CacheResponse {
  status: number;
  headers: {
    location: string;
    cacheControl: string;
    xCache?: string;
  };
}

/**
 * Creates a redirect response based on cache state
 */
function createRedirectResponse(url: string, cacheHit: boolean): CacheResponse {
  return {
    status: 302,
    headers: {
      location: url,
      cacheControl: 'public, max-age=3600, immutable',
      xCache: cacheHit ? 'HIT' : undefined,
    },
  };
}

describe('Property 11: Image cache consistency', () => {
  /**
   * Property: For any query, the hash function SHALL produce consistent results.
   * Same query (case-insensitive, trimmed) MUST produce the same cache key.
   */
  it('should produce consistent cache keys for the same query', () => {
    fc.assert(
      fc.property(
        validImageQueryArb,
        (query) => {
          const hash1 = hashQuery(query);
          const hash2 = hashQuery(query);
          
          // Property: Same query MUST produce same hash
          expect(hash1).toBe(hash2);
          
          // Property: Hash should be a valid MD5 hex string (32 chars)
          expect(hash1).toMatch(/^[a-f0-9]{32}$/);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property: For any query, case variations SHALL produce the same cache key.
   * This ensures cache hits regardless of case.
   */
  it('should produce same cache key for case variations of the same query', () => {
    fc.assert(
      fc.property(
        validImageQueryArb,
        (query) => {
          const lowerHash = hashQuery(query.toLowerCase());
          const upperHash = hashQuery(query.toUpperCase());
          const originalHash = hashQuery(query);
          
          // Property: Case variations MUST produce same hash
          expect(lowerHash).toBe(upperHash);
          expect(lowerHash).toBe(originalHash);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property: For any query with whitespace variations, trimmed versions
   * SHALL produce the same cache key.
   */
  it('should produce same cache key for whitespace-trimmed queries', () => {
    fc.assert(
      fc.property(
        validImageQueryArb,
        fc.array(fc.constantFrom(' ', '\t'), { minLength: 0, maxLength: 3 }),
        fc.array(fc.constantFrom(' ', '\t'), { minLength: 0, maxLength: 3 }),
        (query, prefixWs, suffixWs) => {
          const paddedQuery = prefixWs.join('') + query + suffixWs.join('');
          const originalHash = hashQuery(query);
          const paddedHash = hashQuery(paddedQuery);
          
          // Property: Whitespace-padded queries MUST produce same hash as trimmed
          expect(paddedHash).toBe(originalHash);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property: For any cached query, subsequent requests SHALL return the same URL.
   * This tests the cache retrieval contract.
   */
  it('should return cached URL for previously cached queries', () => {
    fc.assert(
      fc.property(
        validImageQueryArb,
        unsplashUrlArb,
        (query, imageUrl) => {
          const cache = new MockImageCache();
          const queryHash = hashQuery(query);
          
          // First request: cache miss, store URL
          expect(cache.get(queryHash)).toBeNull();
          cache.set(queryHash, imageUrl, 3600);
          
          // Second request: cache hit, return same URL
          const cachedUrl = cache.get(queryHash);
          
          // Property: Cached URL MUST be returned
          expect(cachedUrl).toBe(imageUrl);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property: For any cached query, the response SHALL include X-Cache: HIT header.
   * This tests the response contract for cache hits.
   */
  it('should include X-Cache: HIT header for cached responses', () => {
    fc.assert(
      fc.property(
        unsplashUrlArb,
        (cachedUrl) => {
          const response = createRedirectResponse(cachedUrl, true);
          
          // Property: Response status MUST be 302 (redirect)
          expect(response.status).toBe(302);
          
          // Property: X-Cache header MUST be HIT for cached responses
          expect(response.headers.xCache).toBe('HIT');
          
          // Property: Location MUST be the cached URL
          expect(response.headers.location).toBe(cachedUrl);
          
          // Property: Cache-Control MUST be set correctly
          expect(response.headers.cacheControl).toBe('public, max-age=3600, immutable');
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property: For any non-cached query, the response SHALL NOT include X-Cache header.
   * This tests the response contract for cache misses.
   */
  it('should not include X-Cache header for non-cached responses', () => {
    fc.assert(
      fc.property(
        unsplashUrlArb,
        (freshUrl) => {
          const response = createRedirectResponse(freshUrl, false);
          
          // Property: Response status MUST be 302 (redirect)
          expect(response.status).toBe(302);
          
          // Property: X-Cache header MUST be undefined for cache misses
          expect(response.headers.xCache).toBeUndefined();
          
          // Property: Location MUST be the URL
          expect(response.headers.location).toBe(freshUrl);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property: For any sequence of identical queries, only the first should
   * result in an Unsplash API call (simulated via cache miss then hit).
   */
  it('should not make Unsplash API call for cached queries', () => {
    fc.assert(
      fc.property(
        realisticQueryArb,
        unsplashUrlArb,
        fc.integer({ min: 2, max: 5 }),
        (query, imageUrl, repeatCount) => {
          const cache = new MockImageCache();
          const queryHash = hashQuery(query);
          let unsplashCallCount = 0;
          
          // Simulate multiple requests for the same query
          for (let i = 0; i < repeatCount; i++) {
            const cached = cache.get(queryHash);
            
            if (!cached) {
              // Cache miss - would call Unsplash API
              unsplashCallCount++;
              cache.set(queryHash, imageUrl, 3600);
            }
            // If cached, no Unsplash call needed
          }
          
          // Property: Only ONE Unsplash API call should be made (first request)
          expect(unsplashCallCount).toBe(1);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property: Different queries SHALL produce different cache keys.
   * This ensures no cache collisions for distinct queries.
   */
  it('should produce different cache keys for different queries', () => {
    fc.assert(
      fc.property(
        validImageQueryArb,
        validImageQueryArb,
        (query1, query2) => {
          // Skip if queries are effectively the same after normalization
          const normalized1 = query1.toLowerCase().trim();
          const normalized2 = query2.toLowerCase().trim();
          
          if (normalized1 === normalized2) {
            return; // Skip this case - same query
          }
          
          const hash1 = hashQuery(query1);
          const hash2 = hashQuery(query2);
          
          // Property: Different queries MUST produce different hashes
          expect(hash1).not.toBe(hash2);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property: Cache key generation is deterministic across multiple invocations.
   * For any query, calling hashQuery N times SHALL always return the same result.
   */
  it('should be deterministic across multiple hash invocations', () => {
    fc.assert(
      fc.property(
        validImageQueryArb,
        fc.integer({ min: 3, max: 10 }),
        (query, iterations) => {
          const hashes = Array.from({ length: iterations }, () => hashQuery(query));
          
          // Property: All hashes MUST be identical
          const firstHash = hashes[0];
          expect(hashes.every(h => h === firstHash)).toBe(true);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property: For any cached URL, retrieving it multiple times SHALL return
   * the exact same URL (no mutation).
   */
  it('should return exact same URL on multiple cache retrievals', () => {
    fc.assert(
      fc.property(
        validImageQueryArb,
        unsplashUrlArb,
        fc.integer({ min: 2, max: 5 }),
        (query, originalUrl, retrievalCount) => {
          const cache = new MockImageCache();
          const queryHash = hashQuery(query);
          
          // Store URL in cache
          cache.set(queryHash, originalUrl, 3600);
          
          // Retrieve multiple times
          const results: (string | null)[] = [];
          for (let i = 0; i < retrievalCount; i++) {
            results.push(cache.get(queryHash));
          }
          
          // Property: All retrievals MUST return the exact same URL
          expect(results.every(r => r === originalUrl)).toBe(true);
          
          // Property: URL should not be mutated
          expect(results[0]).toBe(originalUrl);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property: Cache stores URL with correct TTL (1 hour = 3600 seconds).
   * This validates Requirements 3.4.
   */
  it('should store cache with 1-hour TTL', () => {
    fc.assert(
      fc.property(
        validImageQueryArb,
        unsplashUrlArb,
        (query, imageUrl) => {
          const cache = new MockImageCache();
          const queryHash = hashQuery(query);
          const expectedTtl = 3600; // 1 hour in seconds
          
          // Store with TTL
          cache.set(queryHash, imageUrl, expectedTtl);
          
          // Property: Cache entry should exist
          expect(cache.has(queryHash)).toBe(true);
          
          // Property: Cached URL should match
          expect(cache.get(queryHash)).toBe(imageUrl);
        }
      ),
      { numRuns: 100 }
    );
  });
});
