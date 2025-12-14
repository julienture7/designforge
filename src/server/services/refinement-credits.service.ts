/**
 * Refinement Credits Service
 * 
 * Handles credit checking and decrementing for PRO tier users
 * based on refinement level selection.
 * 
 * Credit costs:
 * - REFINED: 1 credit
 * - ENHANCED: 2 credits
 * - ULTIMATE: 4 credits
 */

import { db } from "~/server/db";

export type RefinementLevel = "REFINED" | "ENHANCED" | "ULTIMATE";

/**
 * Get credit cost for a refinement level
 */
export function getRefinementCreditCost(refinementLevel: RefinementLevel): number {
  switch (refinementLevel) {
    case "REFINED":
      return 1;
    case "ENHANCED":
      return 2;
    case "ULTIMATE":
      return 4;
  }
}

export interface RefinementCreditCheckResult {
  allowed: boolean;
  remainingCredits: number; // Unified Pro credits
  version: number;
}

export interface RefinementCreditDecrementResult {
  success: boolean;
  newCredits?: number; // Unified Pro credits
  newVersion?: number;
}

/**
 * Check if PRO user has credits for the selected refinement level
 */
export async function checkRefinementCredits(
  dbUserId: string,
  refinementLevel: RefinementLevel
): Promise<RefinementCreditCheckResult> {
  const user = await db.user.findUnique({
    where: { id: dbUserId },
    select: {
      credits: true, // Pro users use unified credits field
      version: true,
    },
  });

  if (!user) {
    throw new Error(`User not found: ${dbUserId}`);
  }

  const cost = getRefinementCreditCost(refinementLevel);
  const allowed = user.credits >= cost;

  return {
    allowed,
    remainingCredits: user.credits,
    version: user.version,
  };
}

/**
 * Decrement credits for the selected refinement level using OCC
 */
export async function decrementRefinementCredits(
  userId: string,
  currentVersion: number,
  refinementLevel: RefinementLevel
): Promise<RefinementCreditDecrementResult> {
  const cost = getRefinementCreditCost(refinementLevel);
  
  const result = await db.$transaction(async (tx) => {
    // Check and decrement unified credits
    const whereClause = {
      id: userId,
      version: currentVersion,
      credits: { gte: cost }, // Must have enough credits
    };

    const updateResult = await tx.user.updateMany({
      where: whereClause,
      data: {
        credits: { decrement: cost },
        version: { increment: 1 },
      },
    });

    if (updateResult.count === 0) {
      return { success: false as const };
    }

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

/**
 * Initialize PRO tier credits (called when subscription is activated)
 * Pro users get 100 unified credits that can be used for any refinement level
 */
export async function initializeProCredits(userId: string): Promise<void> {
  await db.user.update({
    where: { id: userId },
    data: {
      credits: 100, // 100 unified Pro credits
    },
  });
}


