/**
 * Image Proxy Route Handler
 * 
 * Resolves Unsplash queries to image URLs with caching and SSRF protection.
 * 
 * @see Requirements 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8, 3.9, 8.3, 8.4
 */

import { type NextRequest, NextResponse } from "next/server";
import { createHash } from "crypto";
import { env } from "~/env";
import { getImageCache, setImageCache } from "~/server/lib/redis";
import { isSSRFAttempt, logSSRFAttempt } from "~/lib/utils/ssrf-validator";
import {
  checkRateLimit,
  createRateLimitResponse,
  getClientIp,
} from "~/server/lib/rate-limiter";
import { 
  imageProxyQuerySchema, 
  createValidationErrorResponse,
} from "~/lib/validators/common";

// Route segment config
export const dynamic = "force-dynamic";

// Placeholder image path
const PLACEHOLDER_IMAGE = "/images/placeholder.svg";

// Unsplash API timeout (5 seconds)
const UNSPLASH_TIMEOUT = 5000;

// Retry delay (500ms)
const RETRY_DELAY = 500;

/**
 * Generate MD5 hash of query for cache key
 */
function hashQuery(query: string): string {
  return createHash("md5").update(query.toLowerCase().trim()).digest("hex");
}

/**
 * Create redirect response with proper headers
 */
function createRedirectResponse(
  url: string,
  cacheHit: boolean
): NextResponse {
  const response = NextResponse.redirect(url, 302);
  response.headers.set("Cache-Control", "public, max-age=604800, immutable"); // 7 days
  if (cacheHit) {
    response.headers.set("X-Cache", "HIT");
  }
  return response;
}

/**
 * Create placeholder redirect response
 */
function createPlaceholderResponse(request: NextRequest): NextResponse {
  const baseUrl = new URL(request.url).origin;
  return createRedirectResponse(`${baseUrl}${PLACEHOLDER_IMAGE}`, false);
}


/**
 * Unsplash API response type
 */
interface UnsplashSearchResponse {
  results: Array<{
    urls: {
      regular: string;
      small: string;
      thumb: string;
    };
  }>;
  total: number;
}

/**
 * Fetch image from Unsplash API with timeout
 * @see Requirements 3.1, 3.2 - Unsplash API integration
 */
async function fetchFromUnsplash(
  query: string,
  signal: AbortSignal
): Promise<string | null> {
  const url = new URL("https://api.unsplash.com/search/photos");
  url.searchParams.set("query", query);
  url.searchParams.set("per_page", "1");

  const response = await fetch(url.toString(), {
    headers: {
      Authorization: `Client-ID ${env.UNSPLASH_ACCESS_KEY}`,
      "Accept-Version": "v1",
      Accept: "application/json",
    },
    signal,
  });

  // Handle rate limit (403)
  // @see Requirements 3.8
  if (response.status === 403) {
    console.warn(
      JSON.stringify({
        event: "unsplash_rate_limit",
        query,
        timestamp: new Date().toISOString(),
      })
    );
    return null;
  }

  // Handle server errors (5xx)
  if (response.status >= 500) {
    throw new Error(`Unsplash server error: ${response.status}`);
  }

  if (!response.ok) {
    console.error(`Unsplash API error: ${response.status}`);
    return null;
  }

  const data = (await response.json()) as UnsplashSearchResponse;

  // Handle zero results
  // @see Requirements 3.7
  if (!data.results || data.results.length === 0) {
    return null;
  }

  return data.results[0]?.urls.regular ?? null;
}

/**
 * Fetch with retry logic
 * @see Requirements 3.9 - Retry once after 500ms on 5xx/timeout
 */
async function fetchWithRetry(query: string): Promise<string | null> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), UNSPLASH_TIMEOUT);

  try {
    const result = await fetchFromUnsplash(query, controller.signal);
    clearTimeout(timeoutId);
    return result;
  } catch (error) {
    clearTimeout(timeoutId);

    // Check if it's a timeout or server error - retry once
    if (
      error instanceof Error &&
      (error.name === "AbortError" || error.message.includes("server error"))
    ) {
      // Wait 500ms before retry
      await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY));

      const retryController = new AbortController();
      const retryTimeoutId = setTimeout(
        () => retryController.abort(),
        UNSPLASH_TIMEOUT
      );

      try {
        const result = await fetchFromUnsplash(query, retryController.signal);
        clearTimeout(retryTimeoutId);
        return result;
      } catch {
        clearTimeout(retryTimeoutId);
        return null;
      }
    }

    return null;
  }
}

/**
 * GET /api/proxy/image
 * 
 * Resolves Unsplash query to image URL with caching and SSRF protection.
 * 
 * @see Requirements 3.3, 3.4, 3.5, 3.6, 8.3, 8.4
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  // Rate limiting check (Requirements 8.3, 8.4)
  // Track by IP since this endpoint doesn't require authentication
  const rateLimitResult = await checkRateLimit(request, false); // false = general endpoint (100/min)
  if (!rateLimitResult.success) {
    const clientIp = getClientIp(request);
    console.log({
      event: "rate_limit_exceeded",
      identifier: clientIp,
      endpoint: "/api/proxy/image",
      timestamp: new Date().toISOString(),
    });
    return createRateLimitResponse(rateLimitResult) as unknown as NextResponse;
  }

  const searchParams = request.nextUrl.searchParams;
  const query = searchParams.get("query");

  // Validate query parameter
  const parseResult = imageProxyQuerySchema.safeParse({ query });
  if (!parseResult.success) {
    return NextResponse.json(
      createValidationErrorResponse(parseResult.error, crypto.randomUUID()),
      { status: 400 }
    );
  }

  const validQuery = parseResult.data.query;

  // SSRF check
  // @see Requirements 3.10, 3.11
  if (isSSRFAttempt(validQuery)) {
    const clientIp =
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
      request.headers.get("x-real-ip") ??
      "unknown";
    logSSRFAttempt(validQuery, clientIp);

    return NextResponse.json(
      {
        success: false,
        error: {
          code: "INVALID_QUERY",
          message: "Invalid image search query",
          correlationId: crypto.randomUUID(),
        },
      },
      { status: 400 }
    );
  }

  // Generate cache key
  const queryHash = hashQuery(validQuery);

  // Check Redis cache first
  // @see Requirements 3.4, 3.5
  try {
    const cachedUrl = await getImageCache(queryHash);
    if (cachedUrl) {
      return createRedirectResponse(cachedUrl, true);
    }
  } catch (error) {
    // Log cache error but continue to Unsplash
    console.error("Redis cache read error:", error);
  }

  // Fetch from Unsplash
  // @see Requirements 3.3
  const imageUrl = await fetchWithRetry(validQuery);

  if (!imageUrl) {
    // Return placeholder for failed/empty results
    // @see Requirements 3.7, 3.8, 3.9
    return createPlaceholderResponse(request);
  }

  // Cache the result
  // @see Requirements 3.4
  try {
    await setImageCache(queryHash, imageUrl, 86400 * 7); // 7 days TTL - Unsplash URLs are stable
  } catch (error) {
    // Log cache error but continue with response
    console.error("Redis cache write error:", error);
  }

  // Return redirect to image URL
  // @see Requirements 3.3, 3.6
  return createRedirectResponse(imageUrl, false);
}
