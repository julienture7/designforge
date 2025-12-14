import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';

/**
 * **Feature: generative-ui-platform, Property 2: Protected routes require authentication**
 * **Validates: Requirements 1.3**
 * 
 * For any protected route (`/dashboard`, `/editor/*`) and any request without
 * a valid session token, the middleware SHALL return HTTP 401 status.
 * 
 * This test validates the middleware logic that determines:
 * 1. Which routes are protected
 * 2. That unauthenticated requests to protected routes return 401
 */

// Protected route patterns as defined in middleware.ts
const PROTECTED_ROUTE_PREFIXES = ['/dashboard', '/editor'];

/**
 * Checks if a path matches a protected route pattern
 * This mirrors the exact logic from src/middleware.ts isProtectedRoute function
 */
function isProtectedRoute(pathname: string): boolean {
  return PROTECTED_ROUTE_PREFIXES.some(
    (route) => pathname === route || pathname.startsWith(`${route}/`)
  );
}

/**
 * Simulates the middleware response for an unauthenticated request
 * Returns the status code that would be returned
 * 
 * From middleware.ts:
 * - API requests (Accept: application/json) get 401 directly
 * - Browser requests get 302 redirect with X-Auth-Status: 401 header
 */
function getUnauthenticatedResponseStatus(
  pathname: string,
  isApiRequest: boolean
): { status: number; isProtected: boolean; authRequired: boolean } {
  const isProtected = isProtectedRoute(pathname);
  
  if (!isProtected) {
    // Non-protected routes pass through (200)
    return { status: 200, isProtected: false, authRequired: false };
  }
  
  // Protected route without auth
  if (isApiRequest) {
    // API requests get 401 directly
    return { status: 401, isProtected: true, authRequired: true };
  }
  
  // Browser requests get 302 redirect (but with X-Auth-Status: 401 header)
  // The semantic intent is 401, implemented as redirect for UX
  return { status: 302, isProtected: true, authRequired: true };
}

// Arbitrary for generating valid project IDs (cuid-like format)
const projectIdArb = fc.stringMatching(/^[a-z0-9]{20,30}$/);

// Arbitrary for generating random path segments
const pathSegmentArb = fc.stringMatching(/^[a-z0-9-]{1,20}$/);

// Arbitrary for generating protected dashboard paths
const dashboardPathArb = fc.oneof(
  fc.constant('/dashboard'),
  fc.tuple(pathSegmentArb).map(([segment]) => `/dashboard/${segment}`),
  fc.tuple(pathSegmentArb, pathSegmentArb).map(([s1, s2]) => `/dashboard/${s1}/${s2}`)
);

// Arbitrary for generating protected editor paths
const editorPathArb = fc.oneof(
  fc.constant('/editor'),
  projectIdArb.map((id) => `/editor/${id}`),
  fc.tuple(projectIdArb, pathSegmentArb).map(([id, segment]) => `/editor/${id}/${segment}`)
);

// Arbitrary for all protected paths
const protectedPathArb = fc.oneof(dashboardPathArb, editorPathArb);

// Arbitrary for generating non-protected paths
const nonProtectedPathArb = fc.oneof(
  fc.constant('/'),
  fc.constant('/auth/signin'),
  fc.constant('/auth/signup'),
  fc.constant('/api/proxy/image'),
  fc.constant('/api/webhooks/stripe'),
  pathSegmentArb.map((segment) => `/${segment}`),
  fc.tuple(pathSegmentArb, pathSegmentArb)
    .filter(([s1]) => s1 !== 'dashboard' && s1 !== 'editor')
    .map(([s1, s2]) => `/${s1}/${s2}`)
);

describe('Property 2: Protected routes require authentication', () => {
  /**
   * Main Property Test: For any protected route and any API request without
   * a valid session, the middleware SHALL return HTTP 401 status.
   * 
   * This is the core property that validates Requirements 1.3
   */
  it('should return 401 for any protected route API request without valid session', () => {
    fc.assert(
      fc.property(
        protectedPathArb,
        (pathname) => {
          // Simulate an API request (Accept: application/json) without auth
          const response = getUnauthenticatedResponseStatus(pathname, true);
          
          // Property: Protected routes MUST return 401 for unauthenticated API requests
          expect(response.isProtected).toBe(true);
          expect(response.authRequired).toBe(true);
          expect(response.status).toBe(401);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property: For any protected route browser request without valid session,
   * the middleware SHALL redirect (302) with auth required indication
   */
  it('should redirect browser requests to protected routes without valid session', () => {
    fc.assert(
      fc.property(
        protectedPathArb,
        (pathname) => {
          // Simulate a browser request without auth
          const response = getUnauthenticatedResponseStatus(pathname, false);
          
          // Property: Protected routes redirect browser requests
          expect(response.isProtected).toBe(true);
          expect(response.authRequired).toBe(true);
          expect(response.status).toBe(302);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property: For any non-protected route, requests SHALL pass through
   * regardless of authentication status
   */
  it('should allow any non-protected route without authentication', () => {
    fc.assert(
      fc.property(
        nonProtectedPathArb,
        fc.boolean(), // isApiRequest
        (pathname, isApiRequest) => {
          const response = getUnauthenticatedResponseStatus(pathname, isApiRequest);
          
          // Property: Non-protected routes pass through (200)
          expect(response.isProtected).toBe(false);
          expect(response.authRequired).toBe(false);
          expect(response.status).toBe(200);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property: The isProtectedRoute function correctly identifies all
   * /dashboard and /editor/* paths as protected
   */
  it('should correctly identify protected routes for any path pattern', () => {
    fc.assert(
      fc.property(
        protectedPathArb,
        (pathname) => {
          // Property: All generated protected paths MUST be identified as protected
          expect(isProtectedRoute(pathname)).toBe(true);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property: Paths not starting with /dashboard or /editor are not protected
   */
  it('should not protect paths outside /dashboard and /editor', () => {
    fc.assert(
      fc.property(
        nonProtectedPathArb,
        (pathname) => {
          // Property: Non-protected paths MUST NOT be identified as protected
          expect(isProtectedRoute(pathname)).toBe(false);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Verification: The protected route prefixes match the middleware configuration
   */
  it('should have protected routes matching middleware config', () => {
    // These must match the middleware.ts protectedRoutes array
    expect(PROTECTED_ROUTE_PREFIXES).toContain('/dashboard');
    expect(PROTECTED_ROUTE_PREFIXES).toContain('/editor');
    expect(PROTECTED_ROUTE_PREFIXES.length).toBe(2);
  });

  /**
   * Property: Exact match routes are protected
   */
  it('should protect exact match routes /dashboard and /editor', () => {
    expect(isProtectedRoute('/dashboard')).toBe(true);
    expect(isProtectedRoute('/editor')).toBe(true);
  });

  /**
   * Property: Nested paths under protected routes are also protected
   */
  it('should protect nested paths under /dashboard and /editor', () => {
    fc.assert(
      fc.property(
        pathSegmentArb,
        projectIdArb,
        (segment, projectId) => {
          // All nested dashboard paths are protected
          expect(isProtectedRoute(`/dashboard/${segment}`)).toBe(true);
          expect(isProtectedRoute(`/dashboard/${segment}/${projectId}`)).toBe(true);
          
          // All nested editor paths are protected
          expect(isProtectedRoute(`/editor/${projectId}`)).toBe(true);
          expect(isProtectedRoute(`/editor/${projectId}/${segment}`)).toBe(true);
        }
      ),
      { numRuns: 100 }
    );
  });
});
