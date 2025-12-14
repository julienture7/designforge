/**
 * Webhook Cleanup Cron Job API Route
 * 
 * Deletes ProcessedWebhook records older than 30 days to prevent table growth.
 * 
 * Requirements: 7.10
 * 
 * Security:
 * - Verifies CRON_SECRET header to prevent unauthorized access
 * - Only accessible via Vercel Cron or authorized services
 * 
 * Usage:
 * - Configure in vercel.json: { "crons": [{ "path": "/api/cron/cleanup-webhooks", "schedule": "0 2 * * 0" }] }
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
 * GET /api/cron/cleanup-webhooks
 * 
 * Deletes ProcessedWebhook records older than 30 days.
 * Called by Vercel Cron weekly (Sunday at 2 AM UTC).
 * 
 * Requirements: 7.10
 */
export async function GET(req: NextRequest): Promise<NextResponse> {
  // Verify cron secret for security
  if (!verifyCronSecret(req)) {
    logCronEvent("cron_unauthorized_access", {
      ip: req.headers.get("x-forwarded-for") ?? "unknown",
      path: "/api/cron/cleanup-webhooks",
    });
    
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401 }
    );
  }

  try {
    // Calculate 30 days ago
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    // Delete ProcessedWebhook records older than 30 days
    // Requirements: 7.10
    const result = await db.processedWebhook.deleteMany({
      where: {
        processedAt: {
          lt: thirtyDaysAgo,
        },
      },
    });

    logCronEvent("webhook_cleanup_completed", {
      recordsDeleted: result.count,
      cutoffDate: thirtyDaysAgo.toISOString(),
    });

    return NextResponse.json({
      success: true,
      data: {
        recordsDeleted: result.count,
        cutoffDate: thirtyDaysAgo.toISOString(),
      },
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    
    logCronEvent("webhook_cleanup_failed", {
      error: errorMessage,
    });

    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
