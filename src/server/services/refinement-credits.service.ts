/**
 * Refinement Credits Service
 * 
 * Handles credit checking and decrementing for PRO tier users
 * based on refinement level selection.
 * 
 * Credit costs:
 * - NORMAL: 1 credit (Gemini 3 Pro, no refinement)
 * - REFINED: 5 credits (Gemini 3 Pro with 1 refinement pass)
 */

import { db } from "~/server/db";

export type RefinementLevel = "NORMAL" | "REFINED";

/**
 * Get credit cost for a refinement level
 */
export function getRefinementCreditCost(refinementLevel: RefinementLevel): number {
  switch (refinementLevel) {
    case "NORMAL":
      return 1;
    case "REFINED":
      return 5;
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
  
  console.log(`[decrementRefinementCredits] User ${userId}, Level: ${refinementLevel}, Cost: ${cost} credits`);
  
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

    console.log(`[decrementRefinementCredits] Successfully decremented ${cost} credits. New balance: ${updatedUser?.credits}`);

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
 * Pro users get 300 credits that can be used for any generation mode
 */
export async function initializeProCredits(userId: string): Promise<void> {
  await db.user.update({
    where: { id: userId },
    data: {
      credits: 300, // 300 Pro credits
    },
  });
}


