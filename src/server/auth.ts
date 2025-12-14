/**
 * Clerk Authentication Helpers
 * 
 * Server-side authentication utilities using Clerk.
 * Provides helpers for getting user data and syncing with database.
 */

import { auth, currentUser } from "@clerk/nextjs/server";
import { db } from "./db";
import type { Tier } from "./lib/tier-utils";

// Extended user type with tier and credits
export interface AppUser {
  id: string;
  clerkId: string;
  email: string;
  name: string | null;
  tier: Tier;
  credits: number;
  version: number;
}

/**
 * Get the current authenticated user's Clerk ID
 */
export async function getAuthUserId(): Promise<string | null> {
  const { userId } = await auth();
  return userId;
}

/**
 * Get or create a user in the database based on Clerk authentication
 * This syncs Clerk user data with our database
 */
export async function getOrCreateUser(): Promise<AppUser | null> {
  const { userId } = await auth();
  
  if (!userId) {
    return null;
  }

  // Use Clerk data to keep our DB user profile in sync.
  // NOTE: We must be concurrency-safe: Next.js can trigger parallel server renders,
  // so "find then create" can race and violate unique constraints.
  const clerkUser = await currentUser();

  if (!clerkUser) {
    return null;
  }

  const email =
    clerkUser.primaryEmailAddress?.emailAddress ??
    clerkUser.emailAddresses[0]?.emailAddress ??
    // Fallback must be unique to avoid violating User.email @unique
    `${userId}@users.clerk.local`;

  const name = clerkUser.firstName
    ? `${clerkUser.firstName}${clerkUser.lastName ? ` ${clerkUser.lastName}` : ""}`
    : null;

  const select = {
    id: true,
    clerkId: true,
    email: true,
    name: true,
    tier: true,
    credits: true,
    version: true,
  } as const;

  try {
    // Atomic "get or create", safe under concurrency.
    return await db.user.upsert({
      where: { clerkId: userId },
      create: {
        clerkId: userId,
        email,
        name,
        tier: "FREE",
        credits: 5,
        version: 0,
      },
      // Keep profile fields in sync, but never touch tier/credits/version here.
      update: {
        ...(email ? { email } : {}),
        name,
      },
      select,
    });
  } catch (err: any) {
    // If two requests race, one may still see a unique-constraint error.
    // In that case, read the existing user and continue.
    if (err?.code === "P2002") {
      const existing = await db.user.findUnique({
        where: { clerkId: userId },
        select,
      });
      if (existing) return existing;
    }
    throw err;
  }
}

/**
 * Get user by their database ID
 */
export async function getUserById(id: string): Promise<AppUser | null> {
  const user = await db.user.findUnique({
    where: { id },
    select: {
      id: true,
      clerkId: true,
      email: true,
      name: true,
      tier: true,
      credits: true,
      version: true,
    },
  });

  return user;
}

/**
 * Get user by their Clerk ID
 */
export async function getUserByClerkId(clerkId: string): Promise<AppUser | null> {
  const user = await db.user.findUnique({
    where: { clerkId },
    select: {
      id: true,
      clerkId: true,
      email: true,
      name: true,
      tier: true,
      credits: true,
      version: true,
    },
  });

  return user;
}

/**
 * Require authentication - throws if not authenticated
 */
export async function requireAuth(): Promise<string> {
  const userId = await getAuthUserId();
  
  if (!userId) {
    throw new Error("Unauthorized");
  }

  return userId;
}
