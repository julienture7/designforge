import { Redis } from "@upstash/redis";
import { env } from "~/env";

/**
 * Redis client singleton for Upstash Redis
 * Used for:
 * - Generation locks (generation:lock:{userId})
 * - Stream checkpoints (generation:checkpoint:{projectId})
 * - Image cache (image:cache:{md5(query)})
 * - Rate limiting
 */

const globalForRedis = globalThis as unknown as {
  redis: Redis | undefined;
};

/**
 * Create Redis client with Upstash REST API
 * Requires UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN environment variables
 */
function createRedisClient(): Redis {
  // Environment variables are validated by Zod in env.js
  // They are required, so we can safely assert they exist
  return new Redis({
    url: env.UPSTASH_REDIS_REST_URL,
    token: env.UPSTASH_REDIS_REST_TOKEN,
  });
}

export const redis = globalForRedis.redis ?? createRedisClient();

if (env.NODE_ENV !== "production") {
  globalForRedis.redis = redis;
}

/**
 * Acquire a generation lock for a user
 * Prevents concurrent generations by the same user
 * 
 * @param userId - The user ID to lock
 * @returns true if lock was acquired, false if already held
 */
export async function acquireGenerationLock(userId: string): Promise<boolean> {
  const key = `generation:lock:${userId}`;
  // SETNX with 60 second TTL
  const result = await redis.set(key, "1", { ex: 60, nx: true });
  return result === "OK";
}

/**
 * Release a generation lock for a user
 * 
 * @param userId - The user ID to unlock
 */
export async function releaseGenerationLock(userId: string): Promise<void> {
  const key = `generation:lock:${userId}`;
  await redis.del(key);
}

/**
 * Check if a generation lock is held for a user
 * 
 * @param userId - The user ID to check
 * @returns true if lock is held, false otherwise
 */
export async function isGenerationLocked(userId: string): Promise<boolean> {
  const key = `generation:lock:${userId}`;
  const result = await redis.exists(key);
  return result === 1;
}

/**
 * Store a generation checkpoint for resuming interrupted streams
 * 
 * @param projectId - The project ID
 * @param html - The accumulated HTML content
 * @param ttlSeconds - Time to live in seconds (default 1 hour)
 */
export async function setGenerationCheckpoint(
  projectId: string,
  html: string,
  ttlSeconds = 3600
): Promise<void> {
  const key = `generation:checkpoint:${projectId}`;
  await redis.set(key, html, { ex: ttlSeconds });
}

/**
 * Get a generation checkpoint for resuming
 * 
 * @param projectId - The project ID
 * @returns The stored HTML or null if not found
 */
export async function getGenerationCheckpoint(
  projectId: string
): Promise<string | null> {
  const key = `generation:checkpoint:${projectId}`;
  return await redis.get<string>(key);
}

/**
 * Delete a generation checkpoint after successful completion
 * 
 * @param projectId - The project ID
 */
export async function deleteGenerationCheckpoint(
  projectId: string
): Promise<void> {
  const key = `generation:checkpoint:${projectId}`;
  await redis.del(key);
}

/**
 * Cache an image URL from Unsplash
 * 
 * @param queryHash - MD5 hash of the query
 * @param url - The resolved image URL
 * @param ttlSeconds - Time to live in seconds (default 1 hour)
 */
export async function setImageCache(
  queryHash: string,
  url: string,
  ttlSeconds = 3600
): Promise<void> {
  const key = `image:cache:${queryHash}`;
  await redis.set(key, url, { ex: ttlSeconds });
}

/**
 * Get a cached image URL
 * 
 * @param queryHash - MD5 hash of the query
 * @returns The cached URL or null if not found
 */
export async function getImageCache(queryHash: string): Promise<string | null> {
  const key = `image:cache:${queryHash}`;
  return await redis.get<string>(key);
}
