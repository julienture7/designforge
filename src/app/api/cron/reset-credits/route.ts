/**
 * Credit Reset Cron Job API Route
 * 
 * Resets all FREE tier users' credits to 20 at UTC midnight.
 * 
 * Requirements: 6.4
 * 
 * Security:
 * - Verifies CRON_SECRET header to prevent unauthorized access
 * - Only accessible via Vercel Cron or authorized services
 * 
 * Usage:
 * - Configure in vercel.json: { "crons": [{ "path": "/api/cron/reset-credits", "schedule": "0 0 * * *" }] }
 * - Or call manually with Authorization header: Bearer {CRON_SECRET}
 */

import { type NextRequest, NextResponse } from "next/server";
import { db } from "~/server/db";
import { env } from "~/env";

// Force dynamic to ensure fresh execution
export const dynamic = "force-dynamic";

/**
 * Structured logging for cron events
 */
function logCronEvent(event: string, data: Record<string, unknown>) {
  console.log(JSON.stringify({
    event,
    timestamp: new Date().toISOString(),
    ...data,
  }));
}

/**
 * Verify cron secret from Authorization header or Vercel cron header
 * 
 * Vercel Cron jobs include an Authorization header with the CRON_SECRET
 * Manual calls should include: Authorization: Bearer {CRON_SECRET}
 * 
 * In production, CRON_SECRET must be set and verified.
 * In development without CRON_SECRET, all requests are rejected for security.
 */
function verifyCronSecret(req: NextRequest): boolean {
  // If CRON_SECRET is not configured, reject all requests
  if (!env.CRON_SECRET) {
    logCronEvent("cron_secret_not_configured", {
      message: "CRON_SECRET environment variable is not set",
    });
    return false;
  }

  // Check for Vercel Cron authorization header
  const authHeader = req.headers.get("authorization");
  
  if (!authHeader) {
    return false;
  }

  // Support both "Bearer {secret}" format and direct secret
  const token = authHeader.startsWith("Bearer ") 
    ? authHeader.slice(7) 
    : authHeader;

  return token === env.CRON_SECRET;
}

/**
 * GET /api/cron/reset-credits
 * 
 * Resets all FREE tier users' credits to 20.
 * Called by Vercel Cron at UTC midnight.
 * 
 * Requirements: 6.4
 */
export async function GET(req: NextRequest): Promise<NextResponse> {
  // Verify cron secret for security
  if (!verifyCronSecret(req)) {
    logCronEvent("cron_unauthorized_access", {
      ip: req.headers.get("x-forwarded-for") ?? "unknown",
      path: "/api/cron/reset-credits",
    });
    
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401 }
    );
  }

  try {
    // Reset all FREE tier users' credits to 20
    // Requirements: 6.4
    const result = await db.user.updateMany({
      where: { tier: "FREE" },
      data: { credits: 20 },
    });

    logCronEvent("credits_reset_completed", {
      usersUpdated: result.count,
    });

    return NextResponse.json({
      success: true,
      data: {
        usersUpdated: result.count,
        resetTo: 20,
      },
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    
    logCronEvent("credits_reset_failed", {
      error: errorMessage,
    });

    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
