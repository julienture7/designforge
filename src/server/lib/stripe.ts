import Stripe from "stripe";
import { env } from "~/env";

/**
 * Stripe client singleton for payment processing
 * Used for:
 * - Creating checkout sessions for Pro subscriptions
 * - Managing customer subscriptions
 * - Processing webhook events
 */

const globalForStripe = globalThis as unknown as {
  stripe: Stripe | undefined;
};

/**
 * Create Stripe client with secret key
 * Requires STRIPE_SECRET_KEY environment variable
 */
function createStripeClient(): Stripe {
  // Environment variables are validated by Zod in env.js
  // STRIPE_SECRET_KEY is required, so we can safely use it
  return new Stripe(env.STRIPE_SECRET_KEY, {
    // Use your Stripe account's pinned API version.
    // (We intentionally avoid hardcoding an invalid/unknown version string here.)
    typescript: true,
  });
}

export const stripe = globalForStripe.stripe ?? createStripeClient();

if (env.NODE_ENV !== "production") {
  globalForStripe.stripe = stripe;
}
