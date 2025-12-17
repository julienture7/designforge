import { db } from "~/server/db";
import type { Tier } from "../../../generated/prisma";

/**
 * Result of checking a user's credit status
 */
export interface CreditCheckResult {
  /** Whether the user is allowed to generate */
  allowed: boolean;
  /** Remaining credits for FREE tier users */
  remainingCredits: number;
  /** User's subscription tier */
  tier: Tier;
  /** Current version for OCC */
  version: number;
  /** Database user ID (for credit operations) */
  dbUserId: string;
}

/**
 * Result of decrementing a user's credits
 */
export interface CreditDecrementResult {
  /** Whether the decrement was successful */
  success: boolean;
  /** New credit count after decrement (if successful) */
  newCredits?: number;
  /** New version after decrement (if successful) */
  newVersion?: number;
}

/**
 * Check if a user has credits available for generation
 * 
 * PRO tier users always have unlimited access regardless of credits field.
 * FREE tier users must have credits > 0.
 * 
 * @param dbUserId - The database user ID to check
 * @returns CreditCheckResult with allowed status, remaining credits, tier, and version
 * @throws Error if user is not found
 * 
 * Requirements: 6.1, 6.5
 */
export async function checkCredits(dbUserId: string): Promise<CreditCheckResult> {
  const user = await db.user.findUnique({
    where: { id: dbUserId },
    select: {
      id: true,
      tier: true,
      credits: true,
      version: true,
    },
  });

  if (!user) {
    throw new Error(`User not found: ${dbUserId}`);
  }

  // PRO tier bypasses credit checks (Requirement 6.5)
  if (user.tier === "PRO") {
    return {
      allowed: true,
      remainingCredits: user.credits,
      tier: user.tier,
      version: user.version,
      dbUserId: user.id,
    };
  }

  // FREE tier must have credits > 0 (Requirement 6.1)
  return {
    allowed: user.credits > 0,
    remainingCredits: user.credits,
    tier: user.tier,
    version: user.version,
    dbUserId: user.id,
  };
}

/**
 * Generation mode for FREE tier users
 */
export type GenerationMode = "basic" | "medium";

/**
 * Get the credit cost for a generation mode
 */
export function getGenerationCreditCost(mode: GenerationMode): number {
  switch (mode) {
    case "basic":
      return 2; // Devstral
    case "medium":
      return 4; // DeepSeek
    default:
      return 2;
  }
}

/**
 * Get the credit cost for editing (always 1)
 */
export function getEditCreditCost(): number {
  return 1;
}

/**
 * Check if user has enough credits for a specific operation
 */
export async function checkCreditsForOperation(
  dbUserId: string,
  creditCost: number
): Promise<CreditCheckResult & { hasSufficientCredits: boolean }> {
  const result = await checkCredits(dbUserId);
  return {
    ...result,
    hasSufficientCredits: result.tier === "PRO" || result.remainingCredits >= creditCost,
  };
}

/**
 * Decrement a user's credits using Optimistic Concurrency Control (OCC)
 * 
 * Uses Prisma transaction with version check to prevent race conditions where
 * multiple concurrent requests could decrement credits simultaneously.
 * 
 * The operation will fail if:
 * - The user's version has changed since it was read (concurrent modification)
 * - The user has no credits remaining
 * 
 * @param userId - The user ID to decrement credits for
 * @param currentVersion - The version number read when checking credits
 * @param amount - Number of credits to decrement (default: 1)
 * @returns CreditDecrementResult indicating success/failure
 * 
 * Requirements: 6.2, 6.8
 */
export async function decrementCredits(
  userId: string,
  currentVersion: number,
  amount: number = 1
): Promise<CreditDecrementResult> {
  // Use Prisma transaction with updateMany and version check for OCC pattern
  // This ensures atomic check-and-update with proper isolation
  const result = await db.$transaction(async (tx) => {
    // Atomic update with OCC pattern - single query that checks version and credits
    const updateResult = await tx.user.updateMany({
      where: {
        id: userId,
        credits: { gte: amount },
        version: currentVersion, // OCC check
      },
      data: {
        credits: { decrement: amount },
        version: { increment: 1 },
      },
    });

    // If count is 0, either version changed or credits depleted
    if (updateResult.count === 0) {
      return { success: false as const };
    }

    // Fetch updated user to return new values (within same transaction)
    const updatedUser = await tx.user.findUnique({
      where: { id: userId },
      select: {
        credits: true,
        version: true,
      },
    });

    return {
      success: true as const,
      newCredits: updatedUser?.credits,
      newVersion: updatedUser?.version,
    };
  });

  return result;
}
