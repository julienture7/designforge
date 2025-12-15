/**
 * Tier utility functions
 * Maps subscription tiers to their refinement pass counts
 */

export type Tier = "FREE" | "PRO";

/**
 * Get the number of AI refinement passes for a given tier
 * @param tier - The user's subscription tier
 * @returns Number of refinement passes (0-3)
 */
export function getRefinementPasses(tier: Tier): number {
  switch (tier) {
    case "FREE":
      return 0;
    case "PRO":
      // PRO tier users can choose refinement level (REFINED=1, ENHANCED=2, ULTIMATE=3)
      // This function returns the base - actual passes are determined by refinement level selection
      return 1;
    default:
      return 0;
  }
}

/**
 * Get tier display name for UI
 */
export function getTierDisplayName(tier: Tier): string {
  switch (tier) {
    case "FREE":
      return "Free";
    case "PRO":
      return "Pro";
    default:
      return "Free";
  }
}

/**
 * Get tier description for pricing page
 */
export function getTierDescription(tier: Tier): string {
  switch (tier) {
    case "FREE":
      return "Perfect for trying out";
    case "PRO":
      return "Normal (1 credit) and Refined (5 credits) modes with Gemini 3 Pro";
    default:
      return "";
  }
}


