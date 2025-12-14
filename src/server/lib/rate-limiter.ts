/**
 * Rate Limiter Middleware with Proper IP Extraction
 * 
 * Uses Upstash Ratelimit for distributed rate limiting.
 * 
 * Requirements:
 * - 8.3: 10 requests/minute for /api/generate
 * - 8.4: 100 requests/minute for other endpoints, block IP for 5 minutes if exceeded
 * - 8.5: Extract client IP from X-Forwarded-For header (first IP) or X-Real-IP header
 * 
 * CRITICAL: In Vercel serverless environment, req.ip and req.socket.remoteAddress
 * return load balancer IPs, NOT the actual client IP. We must use headers.
 */

import { Ratelimit } from "@upstash/ratelimit";
import { redis } from "./redis";
import type { NextRequest } from "next/server";

/**
 * Rate limiter for /api/generate endpoint
 * 10 requests per minute using sliding window
 */
export const generateRateLimiter = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(10, "1 m"),
  prefix: "ratelimit:generate",
  analytics: true,
});

/**
 * Rate limiter for general endpoints
 * 100 requests per minute using sliding window
 */
export const generalRateLimiter = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(100, "1 m"),
  prefix: "ratelimit:general",
  analytics: true,
});

/**
 * IP block tracker for users who exceed 100 requests/minute
 * Blocks IP for 5 minutes
 */
export const ipBlocker = new Ratelimit({
  redis,
  limiter: Ratelimit.fixedWindow(1, "5 m"),
  prefix: "ratelimit:blocked",
  analytics: true,
});


/**
 * Extract client IP address from request headers
 * 
 * CRITICAL: In Vercel/serverless environments, we MUST read from headers:
 * - X-Forwarded-For: Contains comma-separated list of IPs (client, proxy1, proxy2, ...)
 *   We take the FIRST IP which is the original client
 * - X-Real-IP: Alternative header set by some proxies
 * 
 * We trust Vercel's proxy to set these headers correctly.
 * 
 * @param request - Next.js request object
 * @returns Client IP address or "unknown" if not found
 */
export function getClientIp(request: NextRequest): string {
  // Try X-Forwarded-For first (standard header for proxied requests)
  const forwardedFor = request.headers.get("x-forwarded-for");
  if (forwardedFor) {
    // X-Forwarded-For format: "client, proxy1, proxy2, ..."
    // We want the first IP (the original client)
    const firstIp = forwardedFor.split(",")[0]?.trim();
    if (firstIp && isValidIp(firstIp)) {
      return firstIp;
    }
  }

  // Try X-Real-IP as fallback
  const realIp = request.headers.get("x-real-ip");
  if (realIp && isValidIp(realIp.trim())) {
    return realIp.trim();
  }

  // Last resort: try to get from request (may be load balancer IP)
  // This is NOT reliable in Vercel but better than nothing
  const ip = request.headers.get("cf-connecting-ip") // Cloudflare
    ?? request.headers.get("true-client-ip") // Akamai
    ?? "unknown";

  return ip;
}

/**
 * Basic IP validation to ensure we have a valid IP format
 * Supports both IPv4 and IPv6
 */
function isValidIp(ip: string): boolean {
  // IPv4 pattern
  const ipv4Pattern = /^(\d{1,3}\.){3}\d{1,3}$/;
  // IPv6 pattern (simplified - allows common formats)
  const ipv6Pattern = /^([0-9a-fA-F]{0,4}:){2,7}[0-9a-fA-F]{0,4}$/;
  
  if (ipv4Pattern.test(ip)) {
    // Validate each octet is 0-255
    const octets = ip.split(".");
    return octets.every((octet) => {
      const num = parseInt(octet, 10);
      return num >= 0 && num <= 255;
    });
  }
  
  return ipv6Pattern.test(ip);
}

export interface RateLimitResult {
  success: boolean;
  limit: number;
  remaining: number;
  reset: number; // Unix timestamp when the limit resets
  retryAfter?: number; // Seconds until retry is allowed
}

/**
 * Check rate limit for a request
 * 
 * @param request - Next.js request object
 * @param isGenerateEndpoint - Whether this is the /api/generate endpoint
 * @returns Rate limit result with success status and metadata
 */
export async function checkRateLimit(
  request: NextRequest,
  isGenerateEndpoint: boolean
): Promise<RateLimitResult> {
  const clientIp = getClientIp(request);
  
  // First check if IP is blocked
  const blockKey = `blocked:${clientIp}`;
  const isBlocked = await redis.exists(blockKey);
  
  if (isBlocked) {
    const ttl = await redis.ttl(blockKey);
    return {
      success: false,
      limit: 0,
      remaining: 0,
      reset: Math.floor(Date.now() / 1000) + ttl,
      retryAfter: ttl > 0 ? ttl : 300, // Default 5 minutes
    };
  }

  // Select appropriate rate limiter
  const limiter = isGenerateEndpoint ? generateRateLimiter : generalRateLimiter;
  const identifier = `${clientIp}:${isGenerateEndpoint ? "generate" : "general"}`;

  const result = await limiter.limit(identifier);

  // If general rate limit exceeded, block IP for 5 minutes
  if (!result.success && !isGenerateEndpoint) {
    await redis.set(blockKey, "1", { ex: 300 }); // 5 minutes
  }

  return {
    success: result.success,
    limit: result.limit,
    remaining: result.remaining,
    reset: result.reset,
    retryAfter: result.success ? undefined : Math.ceil((result.reset - Date.now()) / 1000),
  };
}

/**
 * Create rate limit response headers
 */
export function createRateLimitHeaders(result: RateLimitResult): Headers {
  const headers = new Headers();
  headers.set("X-RateLimit-Limit", result.limit.toString());
  headers.set("X-RateLimit-Remaining", result.remaining.toString());
  headers.set("X-RateLimit-Reset", result.reset.toString());
  
  if (!result.success && result.retryAfter) {
    headers.set("Retry-After", result.retryAfter.toString());
  }
  
  return headers;
}

/**
 * Create a 429 Too Many Requests response
 */
export function createRateLimitResponse(result: RateLimitResult): Response {
  const headers = createRateLimitHeaders(result);
  headers.set("Content-Type", "application/json");

  const retryAfter = result.retryAfter ?? 60;
  
  return new Response(
    JSON.stringify({
      success: false,
      error: {
        code: "RATE_LIMITED",
        message: `Too many requests. Please wait ${retryAfter} seconds`,
        correlationId: crypto.randomUUID(),
      },
    }),
    {
      status: 429,
      headers,
    }
  );
}
