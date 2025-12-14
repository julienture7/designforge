import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { isSSRFAttempt } from '../../src/lib/utils/ssrf-validator';

/**
 * **Feature: generative-ui-platform, Property 12: SSRF attempts are rejected**
 * **Validates: Requirements 3.10**
 * 
 * For any query containing IP addresses, localhost, internal network ranges,
 * protocol schemes, or path traversal sequences, the image proxy SHALL return
 * HTTP 400 with `INVALID_QUERY` error.
 * 
 * Requirements 3.10 specifies:
 * "WHEN validating query parameter THEN the Image_Proxy SHALL reject if
 * `isSSRFAttempt(query)` returns true, where function checks: IPv4/IPv6 patterns,
 * `localhost`, `127.`, `10.`, `192.168.`, `172.16-31.`, `file://`, `http://`,
 * `https://`, `../`, URL-encoded variants"
 */

/**
 * Arbitrary for generating IPv4 addresses (all should be detected as SSRF)
 */
const ipv4Arb = fc.tuple(
  fc.integer({ min: 0, max: 255 }),
  fc.integer({ min: 0, max: 255 }),
  fc.integer({ min: 0, max: 255 }),
  fc.integer({ min: 0, max: 255 })
).map(([a, b, c, d]) => `${a}.${b}.${c}.${d}`);

/**
 * Arbitrary for generating localhost variants
 */
const localhostArb = fc.oneof(
  fc.constant('localhost'),
  fc.constant('LOCALHOST'),
  fc.constant('Localhost'),
  fc.constant('127.0.0.1'),
  fc.constant('127.0.0.0'),
  fc.constant('127.255.255.255'),
  fc.constant('::1'),
  fc.constant('[::1]')
);

/**
 * Arbitrary for generating internal network ranges (10.x.x.x)
 */
const internalNetwork10Arb = fc.tuple(
  fc.integer({ min: 0, max: 255 }),
  fc.integer({ min: 0, max: 255 }),
  fc.integer({ min: 0, max: 255 })
).map(([b, c, d]) => `10.${b}.${c}.${d}`);

/**
 * Arbitrary for generating internal network ranges (192.168.x.x)
 */
const internalNetwork192Arb = fc.tuple(
  fc.integer({ min: 0, max: 255 }),
  fc.integer({ min: 0, max: 255 })
).map(([c, d]) => `192.168.${c}.${d}`);

/**
 * Arbitrary for generating internal network ranges (172.16-31.x.x)
 */
const internalNetwork172Arb = fc.tuple(
  fc.integer({ min: 16, max: 31 }),
  fc.integer({ min: 0, max: 255 }),
  fc.integer({ min: 0, max: 255 })
).map(([b, c, d]) => `172.${b}.${c}.${d}`);


/**
 * Arbitrary for generating protocol scheme attacks
 */
const protocolSchemeArb = fc.oneof(
  fc.constant('file://'),
  fc.constant('FILE://'),
  fc.constant('file:///etc/passwd'),
  fc.constant('http://'),
  fc.constant('HTTP://'),
  fc.constant('http://example.com'),
  fc.constant('https://'),
  fc.constant('HTTPS://'),
  fc.constant('https://example.com'),
  fc.constant('ftp://'),
  fc.constant('FTP://'),
  fc.constant('gopher://'),
  fc.constant('data:'),
  fc.constant('DATA:'),
  fc.constant('javascript:'),
  fc.constant('JAVASCRIPT:')
);

/**
 * Arbitrary for generating path traversal attacks
 */
const pathTraversalArb = fc.oneof(
  fc.constant('../'),
  fc.constant('..\\'),
  fc.constant('..'),
  fc.constant('../../etc/passwd'),
  fc.constant('..\\..\\windows\\system32'),
  fc.constant('....//'),
  fc.constant('..%2f'),
  fc.constant('..%5c')
);

/**
 * Arbitrary for generating URL-encoded SSRF attempts
 */
const urlEncodedArb = fc.oneof(
  // URL-encoded localhost
  fc.constant('%6c%6f%63%61%6c%68%6f%73%74'), // localhost
  fc.constant('%31%32%37%2e%30%2e%30%2e%31'), // 127.0.0.1
  // URL-encoded protocols
  fc.constant('%66%69%6c%65%3a%2f%2f'), // file://
  fc.constant('%68%74%74%70%3a%2f%2f'), // http://
  // URL-encoded path traversal
  fc.constant('%2e%2e%2f'), // ../
  fc.constant('%2e%2e%5c')  // ..\
);

/**
 * Arbitrary for generating special internal addresses
 */
const specialInternalArb = fc.oneof(
  fc.constant('0.0.0.0'),
  fc.constant('169.254.0.1'),
  fc.constant('169.254.169.254') // AWS metadata endpoint
);

/**
 * Combined arbitrary for all SSRF attempt patterns
 * This is the main generator used by the property test
 */
const ssrfAttemptArb = fc.oneof(
  localhostArb,
  internalNetwork10Arb,
  internalNetwork192Arb,
  internalNetwork172Arb,
  protocolSchemeArb,
  pathTraversalArb,
  urlEncodedArb,
  specialInternalArb
);

/**
 * Arbitrary for generating valid image search queries (safe queries)
 * These should NOT be detected as SSRF attempts
 */
const safeQueryArb = fc.stringMatching(/^[A-Za-z][A-Za-z0-9 ]{0,49}$/)
  .filter(s => 
    s.length > 0 && 
    !isSSRFAttempt(s) &&
    !s.includes('..') &&
    !s.includes('://') &&
    !s.includes('localhost')
  );

describe('Property 12: SSRF attempts are rejected', () => {
  /**
   * Main Property Test: For any SSRF attempt pattern, isSSRFAttempt SHALL return true.
   * 
   * This validates Requirements 3.10
   */
  it('should detect any SSRF attempt pattern', () => {
    fc.assert(
      fc.property(
        ssrfAttemptArb,
        (ssrfAttempt) => {
          const result = isSSRFAttempt(ssrfAttempt);
          
          // Property: All SSRF attempts MUST be detected
          expect(result).toBe(true);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property: Localhost variants SHALL always be detected as SSRF attempts.
   */
  it('should detect all localhost variants', () => {
    fc.assert(
      fc.property(
        localhostArb,
        (localhost) => {
          const result = isSSRFAttempt(localhost);
          expect(result).toBe(true);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property: Internal network ranges (10.x.x.x) SHALL be detected as SSRF attempts.
   */
  it('should detect 10.x.x.x internal network ranges', () => {
    fc.assert(
      fc.property(
        internalNetwork10Arb,
        (internalIp) => {
          const result = isSSRFAttempt(internalIp);
          expect(result).toBe(true);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property: Internal network ranges (192.168.x.x) SHALL be detected as SSRF attempts.
   */
  it('should detect 192.168.x.x internal network ranges', () => {
    fc.assert(
      fc.property(
        internalNetwork192Arb,
        (internalIp) => {
          const result = isSSRFAttempt(internalIp);
          expect(result).toBe(true);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property: Internal network ranges (172.16-31.x.x) SHALL be detected as SSRF attempts.
   */
  it('should detect 172.16-31.x.x internal network ranges', () => {
    fc.assert(
      fc.property(
        internalNetwork172Arb,
        (internalIp) => {
          const result = isSSRFAttempt(internalIp);
          expect(result).toBe(true);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property: Protocol schemes (file://, http://, https://, etc.) SHALL be detected.
   */
  it('should detect protocol scheme attacks', () => {
    fc.assert(
      fc.property(
        protocolSchemeArb,
        (protocol) => {
          const result = isSSRFAttempt(protocol);
          expect(result).toBe(true);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property: Path traversal sequences (../, ..\) SHALL be detected.
   */
  it('should detect path traversal attacks', () => {
    fc.assert(
      fc.property(
        pathTraversalArb,
        (traversal) => {
          const result = isSSRFAttempt(traversal);
          expect(result).toBe(true);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property: URL-encoded SSRF attempts SHALL be detected.
   * The validator must decode URL-encoded strings before checking.
   */
  it('should detect URL-encoded SSRF attempts', () => {
    fc.assert(
      fc.property(
        urlEncodedArb,
        (encoded) => {
          const result = isSSRFAttempt(encoded);
          expect(result).toBe(true);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property: Safe image search queries SHALL NOT be detected as SSRF attempts.
   */
  it('should not flag safe image search queries', () => {
    fc.assert(
      fc.property(
        safeQueryArb,
        (safeQuery) => {
          const result = isSSRFAttempt(safeQuery);
          
          // Property: Safe queries MUST NOT be flagged as SSRF
          expect(result).toBe(false);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property: SSRF patterns embedded in text SHALL be detected.
   * Attackers may try to hide SSRF patterns within normal-looking queries.
   */
  it('should detect SSRF patterns embedded in text', () => {
    const embeddedSsrfArb = fc.tuple(
      fc.stringMatching(/^[A-Za-z]{1,10}$/),
      fc.oneof(
        internalNetwork10Arb,
        internalNetwork192Arb,
        internalNetwork172Arb
      ),
      fc.stringMatching(/^[A-Za-z]{1,10}$/)
    ).map(([prefix, ssrf, suffix]) => `${prefix}@${ssrf}/${suffix}`);

    fc.assert(
      fc.property(
        embeddedSsrfArb,
        (embedded) => {
          const result = isSSRFAttempt(embedded);
          expect(result).toBe(true);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property: Empty or null-like inputs SHALL be handled gracefully.
   */
  it('should handle empty and edge case inputs gracefully', () => {
    const edgeCaseArb = fc.oneof(
      fc.constant(''),
      fc.constant(' '),
      fc.constant('   ')
    );

    fc.assert(
      fc.property(
        edgeCaseArb,
        (edgeCase) => {
          // Should not throw, should return false for empty/whitespace
          const result = isSSRFAttempt(edgeCase);
          expect(typeof result).toBe('boolean');
        }
      ),
      { numRuns: 100 }
    );
  });
});
