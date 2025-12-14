/**
 * Stripe Tier Mapping
 * 
 * Maps Stripe Price IDs to application tiers.
 * 
 * IMPORTANT: Update these with your actual Stripe Price IDs after creating products in Stripe Dashboard.
 */

import type { Tier } from "./tier-utils";

/**
 * Map Stripe Price ID to application tier
 * 
 * @param priceId - Stripe Price ID from subscription
 * @returns The corresponding tier, or null if not found
 */
export function getTierFromPriceId(priceId: string | null | undefined): Tier | null {
  if (!priceId) return null;

  // All paid subscriptions map to PRO tier
  // The single Pro tier (€19.99/month) gives access to all refinement levels
  // with separate credit pools for each level
  const proPriceIds = [
    process.env.STRIPE_PRICE_ID_PRO,
    process.env.NEXT_PUBLIC_STRIPE_PRICE_ID,
  ].filter(Boolean) as string[];

  if (proPriceIds.includes(priceId)) {
    return "PRO";
  }

  // Legacy tier mappings (if you had separate tiers before)
  const priceIdToTier: Record<string, Tier> = {
    [process.env.STRIPE_PRICE_ID_REFINED ?? ""]: "PRO",
    [process.env.STRIPE_PRICE_ID_ENHANCED ?? ""]: "PRO",
    [process.env.STRIPE_PRICE_ID_ULTIMATE ?? ""]: "PRO",
  };

  return priceIdToTier[priceId] ?? "PRO"; // Default to PRO for any paid subscription
}

/**
 * Get all valid paid tiers (excludes FREE)
 */
export function getPaidTiers(): Tier[] {
  return ["PRO"];
}

/**
 * Check if a tier is a paid tier
 */
export function isPaidTier(tier: Tier): boolean {
  return tier !== "FREE";
}


