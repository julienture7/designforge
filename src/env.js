import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

export const env = createEnv({
  /**
   * Server-side environment variables schema.
   * API keys MUST be read ONLY from process.env, never from database, localStorage, or client-accessible sources.
   */
  server: {
    // Database
    DATABASE_URL: z.string().url(),
    
    // Node environment
    NODE_ENV: z
      .enum(["development", "test", "production"])
      .default("development"),
    
    // DeepSeek AI API (OpenAI-compatible) - Used for FREE tier
    DEEPSEEK_API_KEY: z.string().min(1, "DEEPSEEK_API_KEY is required"),
    
    // Gemini API - Used for PRO tier (Gemini 3 Pro Preview)
    GEMINI_API_KEY: z.string().min(1, "GEMINI_API_KEY is required"),
    
    // Unsplash API
    UNSPLASH_ACCESS_KEY: z.string().min(1, "UNSPLASH_ACCESS_KEY is required"),
    
    // Stripe
    STRIPE_SECRET_KEY: z.string().min(1, "STRIPE_SECRET_KEY is required"),
    // Webhook secret is optional initially - will be set after webhook configuration
    STRIPE_WEBHOOK_SECRET: z.string().min(1).optional(),
    
    // Clerk Authentication
    CLERK_SECRET_KEY: z.string().min(1, "CLERK_SECRET_KEY is required"),
    
    // Redis (Upstash) - Required for caching, rate limiting, and generation locks
    UPSTASH_REDIS_REST_URL: z.string().url().min(1, "UPSTASH_REDIS_REST_URL is required"),
    UPSTASH_REDIS_REST_TOKEN: z.string().min(1, "UPSTASH_REDIS_REST_TOKEN is required"),
    
    // Sentry - Error tracking (optional in development)
    SENTRY_DSN: z.string().url().optional(),
    
    // Cron Secret - Required for securing cron job endpoints in production
    // Optional in development for easier local testing
    CRON_SECRET: z.string().min(1).optional(),
    
  },

  /**
   * Client-side environment variables schema.
   * To expose them to the client, prefix them with `NEXT_PUBLIC_`.
   * IMPORTANT: Never expose API keys to the client!
   */
  client: {
    // Clerk Publishable Key (safe to expose)
    NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: z.string().min(1, "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY is required"),
    // Public app URL (recommended for Stripe redirect URLs outside Vercel)
    NEXT_PUBLIC_APP_URL: z.string().url().optional(),
    // Stripe Price ID for Pro subscription (safe to expose)
    NEXT_PUBLIC_STRIPE_PRICE_ID:
      process.env.NODE_ENV === "production"
        ? z.string().min(1, "NEXT_PUBLIC_STRIPE_PRICE_ID is required")
        : z.string().min(1).optional(),
  },

  /**
   * Manual destructuring required for Next.js edge runtimes and client-side.
   */
  runtimeEnv: {
    DATABASE_URL: process.env.DATABASE_URL,
    NODE_ENV: process.env.NODE_ENV,
    DEEPSEEK_API_KEY: process.env.DEEPSEEK_API_KEY,
    GEMINI_API_KEY: process.env.GEMINI_API_KEY,
    UNSPLASH_ACCESS_KEY: process.env.UNSPLASH_ACCESS_KEY,
    STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY,
    STRIPE_WEBHOOK_SECRET: process.env.STRIPE_WEBHOOK_SECRET,
    CLERK_SECRET_KEY: process.env.CLERK_SECRET_KEY,
    NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY,
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
    NEXT_PUBLIC_STRIPE_PRICE_ID: process.env.NEXT_PUBLIC_STRIPE_PRICE_ID,
    UPSTASH_REDIS_REST_URL: process.env.UPSTASH_REDIS_REST_URL,
    UPSTASH_REDIS_REST_TOKEN: process.env.UPSTASH_REDIS_REST_TOKEN,
    SENTRY_DSN: process.env.SENTRY_DSN,
    CRON_SECRET: process.env.CRON_SECRET,
  },

  /**
   * Run `build` or `dev` with `SKIP_ENV_VALIDATION` to skip env validation.
   * Useful for Docker builds.
   */
  skipValidation: !!process.env.SKIP_ENV_VALIDATION,

  /**
   * Empty strings are treated as undefined.
   * `SOME_VAR: z.string()` and `SOME_VAR=''` will throw an error.
   */
  emptyStringAsUndefined: true,
});
