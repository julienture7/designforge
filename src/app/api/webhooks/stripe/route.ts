/**
 * Stripe Webhook Handler
 * 
 * Handles Stripe webhook events for subscription management.
 * 
 * Requirements: 7.2, 7.3, 7.4, 7.5, 7.6, 7.9, 7.11, 7.12
 * 
 * Events handled:
 * - checkout.session.completed: New subscription created
 * - customer.subscription.updated: Subscription status changed
 * - customer.subscription.deleted: Subscription canceled
 * 
 * Security:
 * - Verifies webhook signature using STRIPE_WEBHOOK_SECRET
 * - Implements idempotency via ProcessedWebhook table
 * 
 * User Lookup Strategy:
 * - checkout.session.completed: Uses metadata.userId (required for new subscribers)
 * - Other events: Uses stripeCustomerId field on User model
 */

import { type NextRequest, NextResponse } from "next/server";
import type Stripe from "stripe";
import { stripe } from "~/server/lib/stripe";
import { db } from "~/server/db";
import { env } from "~/env";
import { getTierFromPriceId } from "~/server/lib/stripe-tier-mapping";
import type { Tier } from "~/server/lib/tier-utils";
import { initializeProCredits } from "~/server/services/refinement-credits.service";

// Force dynamic to ensure fresh execution
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Structured logging for webhook events
 */
function logWebhookEvent(event: string, data: Record<string, unknown>) {
  console.log(JSON.stringify({
    event,
    timestamp: new Date().toISOString(),
    ...data,
  }));
}

/**
 * Check if webhook has already been processed (idempotency)
 * Requirements: 7.7
 */
async function isWebhookProcessed(eventId: string): Promise<boolean> {
  const existing = await db.processedWebhook.findUnique({
    where: { eventId },
  });
  return existing !== null;
}

/**
 * Mark webhook as processed
 * Requirements: 7.7, 7.8
 */
async function markWebhookProcessed(eventId: string, eventType: string): Promise<void> {
  try {
    await db.processedWebhook.create({
      data: {
        eventId,
        eventType,
      },
    });
  } catch (error) {
    // Handle unique constraint violation (concurrent webhook)
    // This is expected behavior - return 200 anyway
    const maybeCode = (error as any)?.code;
    if (maybeCode === "P2002" || (error instanceof Error && error.message.includes("Unique constraint"))) {
      logWebhookEvent("webhook_duplicate_insert", { eventId, eventType });
      return;
    }
    throw error;
  }
}


/**
 * Handle checkout.session.completed event
 * 
 * CRITICAL: Uses metadata.userId to look up user (required for new subscribers
 * who don't have stripeCustomerId yet), then saves stripeCustomerId for future events.
 * 
 * Requirements: 7.2, 7.9
 */
async function handleCheckoutCompleted(session: Stripe.Checkout.Session): Promise<void> {
  // CRITICAL: Prioritize metadata.userId for user lookup
  const userId = session.metadata?.userId ?? session.client_reference_id;
  
  if (!userId) {
    logWebhookEvent("webhook_missing_user_id", {
      sessionId: session.id,
      customerId: session.customer,
    });
    throw new Error("Missing userId in checkout session metadata");
  }

  const customerId = session.customer as string;
  const subscriptionId = session.subscription as string;

  // Look up user by ID
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true },
  });

  if (!user) {
    // User was deleted - log orphaned subscription
    logWebhookEvent("orphaned_subscription", {
      userId,
      subscriptionId,
      customerId,
    });
    return; // Return without error - acknowledge webhook
  }

  // Get subscription to find the price ID and determine tier
  // For now, all paid subscriptions are PRO tier
  let tier: Tier = "PRO";
  if (subscriptionId) {
    try {
      const subscription = await stripe.subscriptions.retrieve(subscriptionId);
      const priceId = subscription.items.data[0]?.price.id;
      const mappedTier = getTierFromPriceId(priceId);
      // Use mapped tier if available, otherwise default to PRO
      tier = mappedTier ?? "PRO";
    } catch (error) {
      console.error("[Webhook] Failed to retrieve subscription:", error);
      // Fallback to PRO
      tier = "PRO";
    }
  }

  // Update user with PRO tier and Stripe customer ID
  await db.user.update({
    where: { id: userId },
    data: {
      tier,
      subscriptionId,
      subscriptionStatus: "ACTIVE",
      stripeCustomerId: customerId,
    },
  });

  // Initialize Pro credits if this is a new PRO subscription
  if (tier === "PRO") {
    await initializeProCredits(userId);
  }

  logWebhookEvent("subscription_activated", {
    userId,
    subscriptionId,
    customerId,
  });
}

/**
 * Handle customer.subscription.updated event
 * 
 * Uses stripeCustomerId to look up user (handles email changes in Stripe).
 * 
 * Requirements: 7.4, 7.9
 */
async function handleSubscriptionUpdated(subscription: Stripe.Subscription): Promise<void> {
  const customerId = subscription.customer as string;
  const subscriptionId = subscription.id;
  const status = subscription.status;

  // Look up user by stripeCustomerId
  const user = await db.user.findUnique({
    where: { stripeCustomerId: customerId },
    select: { id: true },
  });

  if (!user) {
    // User was deleted - log orphaned subscription
    logWebhookEvent("orphaned_subscription", {
      subscriptionId,
      customerId,
      status,
    });
    return; // Return without error - acknowledge webhook
  }

  // Get current tier from subscription price ID
  const priceId = subscription.items.data[0]?.price.id;
  const currentTier = getTierFromPriceId(priceId);

  // Map Stripe status to our SubscriptionStatus enum
  let subscriptionStatus: "ACTIVE" | "PAST_DUE" | "UNPAID" | "CANCELED";
  let tier: Tier = currentTier ?? "FREE";

  switch (status) {
    case "active":
    case "trialing":
      subscriptionStatus = "ACTIVE";
      tier = currentTier ?? "FREE";
      break;
    case "past_due":
      subscriptionStatus = "PAST_DUE";
      tier = currentTier ?? "FREE"; // Keep tier access during grace period
      break;
    case "unpaid":
      subscriptionStatus = "UNPAID";
      tier = "FREE"; // Revoke paid tier access
      break;
    case "canceled":
    case "incomplete_expired":
      subscriptionStatus = "CANCELED";
      tier = "FREE";
      break;
    default:
      // For other statuses (incomplete, paused), keep current state
      logWebhookEvent("subscription_status_unhandled", {
        userId: user.id,
        subscriptionId,
        status,
      });
      return;
  }

  // Update user subscription status
  const updateData: {
    subscriptionStatus: typeof subscriptionStatus;
    tier: typeof tier;
    credits?: number;
    subscriptionId?: string | null;
    refinedCredits?: number;
    enhancedCredits?: number;
    ultimateCredits?: number;
  } = {
    subscriptionStatus,
    tier,
  };

  // Reset credits based on tier
  if (tier === "FREE") {
    updateData.credits = 5;
    updateData.refinedCredits = 0;
    updateData.enhancedCredits = 0;
    updateData.ultimateCredits = 0;
  }
  // Note: Monthly credit resets for PRO tier should be handled via:
  // - invoice.payment_succeeded webhook event, or
  // - A cron job that checks subscription current_period_end dates

  await db.user.update({
    where: { id: user.id },
    data: updateData,
  });

  logWebhookEvent("subscription_updated", {
    userId: user.id,
    subscriptionId,
    status,
    tier,
  });
}


/**
 * Handle customer.subscription.deleted event
 * 
 * Uses stripeCustomerId to look up user (handles email changes in Stripe).
 * Downgrades user to FREE tier with 5 credits.
 * 
 * Requirements: 7.3, 7.9
 */
async function handleSubscriptionDeleted(subscription: Stripe.Subscription): Promise<void> {
  const customerId = subscription.customer as string;
  const subscriptionId = subscription.id;

  // Look up user by stripeCustomerId
  const user = await db.user.findUnique({
    where: { stripeCustomerId: customerId },
    select: { id: true },
  });

  if (!user) {
    // User was deleted - log orphaned subscription
    logWebhookEvent("orphaned_subscription", {
      subscriptionId,
      customerId,
    });
    return; // Return without error - acknowledge webhook
  }

  // Downgrade user to FREE tier
  await db.user.update({
    where: { id: user.id },
    data: {
      tier: "FREE",
      subscriptionId: null,
      subscriptionStatus: "CANCELED",
      credits: 5, // Reset credits for FREE tier
    },
  });

  logWebhookEvent("subscription_deleted", {
    userId: user.id,
    subscriptionId,
    customerId,
  });
}

/**
 * POST /api/webhooks/stripe
 * 
 * Main webhook handler that verifies signature and routes events.
 * 
 * Requirements: 7.5, 7.6, 7.7, 7.11, 7.12
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  const body = await req.text();
  const signature = req.headers.get("stripe-signature");

  // Get client IP for logging
  const ip = req.headers.get("x-forwarded-for") ?? 
             req.headers.get("x-real-ip") ?? 
             "unknown";

  // Verify signature is present
  if (!signature) {
    logWebhookEvent("webhook_invalid_signature", {
      ip,
      reason: "missing_signature_header",
      headers: Object.fromEntries(req.headers.entries()),
    });
    return NextResponse.json(
      { error: "Missing stripe-signature header" },
      { status: 400 }
    );
  }

  // Check if webhook secret is configured
  if (!env.STRIPE_WEBHOOK_SECRET) {
    logWebhookEvent("webhook_configuration_error", {
      ip,
      reason: "webhook_secret_not_configured",
    });
    return NextResponse.json(
      { error: "Webhook secret not configured" },
      { status: 500 }
    );
  }

  let event: Stripe.Event;

  // Verify webhook signature
  // Requirements: 7.5, 7.6
  try {
    event = stripe.webhooks.constructEvent(
      body,
      signature,
      env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : "Unknown error";
    logWebhookEvent("webhook_invalid_signature", {
      ip,
      reason: "signature_verification_failed",
      error: errorMessage,
      headers: Object.fromEntries(req.headers.entries()),
    });
    return NextResponse.json(
      { error: "Invalid signature" },
      { status: 400 }
    );
  }

  // Check idempotency - if already processed, return 200
  // Requirements: 7.7
  const alreadyProcessed = await isWebhookProcessed(event.id);
  if (alreadyProcessed) {
    logWebhookEvent("webhook_duplicate", {
      eventId: event.id,
      eventType: event.type,
    });
    return NextResponse.json({ received: true, duplicate: true });
  }

  // Process event based on type
  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        await handleCheckoutCompleted(session);
        break;
      }

      case "customer.subscription.updated": {
        const subscription = event.data.object as Stripe.Subscription;
        await handleSubscriptionUpdated(subscription);
        break;
      }

      case "customer.subscription.deleted": {
        const subscription = event.data.object as Stripe.Subscription;
        await handleSubscriptionDeleted(subscription);
        break;
      }

      default:
        // Log unhandled event types but acknowledge receipt
        logWebhookEvent("webhook_unhandled_event", {
          eventId: event.id,
          eventType: event.type,
        });
    }

    // Mark webhook as processed
    // Requirements: 7.7, 7.8
    await markWebhookProcessed(event.id, event.type);

    return NextResponse.json({ received: true });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    
    // Log the error
    logWebhookEvent("webhook_processing_error", {
      eventId: event.id,
      eventType: event.type,
      error: errorMessage,
    });

    // Return 500 so Stripe will retry
    // Requirements: 7.11
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
