/**
 * Refinement Credits Service
 * 
 * Handles credit checking and decrementing for PRO tier users
 * based on refinement level selection.
 */

import { db } from "~/server/db";

export type RefinementLevel = "REFINED" | "ENHANCED" | "ULTIMATE";

export interface RefinementCreditCheckResult {
  allowed: boolean;
  remainingCredits: {
    refined: number;
    enhanced: number;
    ultimate: number;
  };
  version: number;
}

export interface RefinementCreditDecrementResult {
  success: boolean;
  newCredits?: {
    refined: number;
    enhanced: number;
    ultimate: number;
  };
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
      refinedCredits: true,
      enhancedCredits: true,
      ultimateCredits: true,
      version: true,
    },
  });

  if (!user) {
    throw new Error(`User not found: ${dbUserId}`);
  }

  let allowed = false;
  switch (refinementLevel) {
    case "REFINED":
      allowed = user.refinedCredits > 0;
      break;
    case "ENHANCED":
      allowed = user.enhancedCredits > 0;
      break;
    case "ULTIMATE":
      allowed = user.ultimateCredits > 0;
      break;
  }

  return {
    allowed,
    remainingCredits: {
      refined: user.refinedCredits,
      enhanced: user.enhancedCredits,
      ultimate: user.ultimateCredits,
    },
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
  const result = await db.$transaction(async (tx) => {
    // Build where clause based on refinement level
    const whereClause: {
      id: string;
      version: number;
      refinedCredits?: { gt: number };
      enhancedCredits?: { gt: number };
      ultimateCredits?: { gt: number };
    } = {
      id: userId,
      version: currentVersion,
    };

    const dataClause: {
      version: { increment: number };
      refinedCredits?: { decrement: number };
      enhancedCredits?: { decrement: number };
      ultimateCredits?: { decrement: number };
    } = {
      version: { increment: 1 },
    };

    switch (refinementLevel) {
      case "REFINED":
        whereClause.refinedCredits = { gt: 0 };
        dataClause.refinedCredits = { decrement: 1 };
        break;
      case "ENHANCED":
        whereClause.enhancedCredits = { gt: 0 };
        dataClause.enhancedCredits = { decrement: 1 };
        break;
      case "ULTIMATE":
        whereClause.ultimateCredits = { gt: 0 };
        dataClause.ultimateCredits = { decrement: 1 };
        break;
    }

    const updateResult = await tx.user.updateMany({
      where: whereClause,
      data: dataClause,
    });

    if (updateResult.count === 0) {
      return { success: false as const };
    }

    const updatedUser = await tx.user.findUnique({
      where: { id: userId },
      select: {
        refinedCredits: true,
        enhancedCredits: true,
        ultimateCredits: true,
        version: true,
      },
    });

    return {
      success: true as const,
      newCredits: updatedUser
        ? {
            refined: updatedUser.refinedCredits,
            enhanced: updatedUser.enhancedCredits,
            ultimate: updatedUser.ultimateCredits,
          }
        : undefined,
      newVersion: updatedUser?.version,
    };
  });

  return result;
}

/**
 * Initialize PRO tier credits (called when subscription is activated)
 */
export async function initializeProCredits(userId: string): Promise<void> {
  await db.user.update({
    where: { id: userId },
    data: {
      refinedCredits: 100, // 100 Refined generations
      enhancedCredits: 50, // 50 Enhanced generations
      ultimateCredits: 25, // 25 Ultimate generations
    },
  });
}


