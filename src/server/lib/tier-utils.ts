/**
 * Tier utility functions
 * Maps subscription tiers to their refinement pass counts
 */

export type Tier = "FREE" | "REFINED" | "ENHANCED" | "ULTIMATE" | "PRO";

/**
 * Get the number of AI refinement passes for a given tier
 * @param tier - The user's subscription tier
 * @returns Number of refinement passes (0-3)
 */
export function getRefinementPasses(tier: Tier): number {
  switch (tier) {
    case "FREE":
      return 0;
    case "REFINED":
      return 1;
    case "ENHANCED":
      return 2;
    case "ULTIMATE":
      return 3;
    case "PRO":
      // Legacy PRO tier gets 1 refinement pass for backward compatibility
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
    case "REFINED":
      return "Refined";
    case "ENHANCED":
      return "Enhanced";
    case "ULTIMATE":
      return "Ultimate";
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
    case "REFINED":
      return "Single AI refinement pass";
    case "ENHANCED":
      return "Double AI refinement passes";
    case "ULTIMATE":
      return "Triple AI refinement passes";
    case "PRO":
      return "For serious creators";
    default:
      return "";
  }
}


