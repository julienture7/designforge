/**
 * Subscription tRPC Router
 * 
 * Handles Stripe subscription operations for Pro tier upgrades.
 * 
 * Requirements: 7.1
 */
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
import { stripe } from "~/server/lib/stripe";
import { env } from "~/env";
import { isPaidTier } from "~/server/lib/stripe-tier-mapping";
import type { Tier } from "~/server/lib/tier-utils";

/**
 * Get the base URL for redirects
 */
function getBaseUrl(): string {
  if (env.NEXT_PUBLIC_APP_URL) {
    return env.NEXT_PUBLIC_APP_URL;
  }
  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL}`;
  }
  // Fallback for development
  return "http://localhost:3000";
}

export const subscriptionRouter = createTRPCRouter({
  /**
   * Create Stripe Checkout session for Pro subscription
   * 
   * CRITICAL: Passes metadata.userId and client_reference_id for webhook handler
   * to map new subscribers correctly.
   * 
   * Requirements: 7.1
   */
  createCheckout: protectedProcedure
    .input(
      z.object({
        priceId: z.string().min(1, "Price ID is required"),
        successUrl: z.string().url().optional(),
        cancelUrl: z.string().url().optional(),
      }).strict()
    )
    .mutation(async ({ ctx, input }) => {
      // Check if user already has a paid tier subscription
      if (isPaidTier(ctx.user.tier as Tier)) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "You already have an active subscription",
        });
      }

      // Get full user data including stripeCustomerId
      const user = await ctx.db.user.findUnique({
        where: { id: ctx.user.id },
        select: {
          id: true,
          email: true,
          stripeCustomerId: true,
        },
      });

      if (!user) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "User not found",
        });
      }

      const baseUrl = getBaseUrl();
      const successUrl = input.successUrl ?? `${baseUrl}/dashboard?subscription=success`;
      const cancelUrl = input.cancelUrl ?? `${baseUrl}/dashboard?subscription=canceled`;

      try {
        // Create Stripe Checkout session with subscription mode
        // CRITICAL: Pass metadata.userId and client_reference_id for webhook mapping
        const checkoutSession = await stripe.checkout.sessions.create({
          mode: "subscription",
          payment_method_types: ["card"],
          line_items: [
            {
              price: input.priceId,
              quantity: 1,
            },
          ],
          success_url: successUrl,
          cancel_url: cancelUrl,
          // CRITICAL: These fields are required for webhook handler to map new subscribers
          metadata: {
            userId: user.id,
          },
          client_reference_id: user.id,
          // Pre-fill customer email if available
          customer_email: user.stripeCustomerId ? undefined : user.email,
          // Use existing Stripe customer if available
          customer: user.stripeCustomerId ?? undefined,
          // Allow promotion codes
          allow_promotion_codes: true,
          // Billing address collection
          billing_address_collection: "auto",
        });

        return {
          checkoutUrl: checkoutSession.url,
          sessionId: checkoutSession.id,
        };
      } catch (error) {
        console.error("[Subscription] Checkout session creation failed:", error);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to create checkout session",
        });
      }
    }),

  /**
   * Get current subscription status
   * 
   * Returns the user's subscription status including tier, status, and subscription ID.
   * 
   * Requirements: 7.1
   */
  getStatus: protectedProcedure.query(async ({ ctx }) => {
    const user = await ctx.db.user.findUnique({
      where: { id: ctx.user.id },
      select: {
        id: true,
        tier: true,
        subscriptionId: true,
        subscriptionStatus: true,
        stripeCustomerId: true,
      },
    });

    if (!user) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "User not found",
      });
    }

    // If user has a subscription, fetch latest status from Stripe
    let stripeSubscriptionDetails: {
      status: string;
      currentPeriodEnd: number;
      cancelAtPeriodEnd: boolean;
    } | null = null;
    
    if (user.subscriptionId && user.stripeCustomerId) {
      try {
        const stripeSubscription = await stripe.subscriptions.retrieve(user.subscriptionId);
        // Stripe SDK v20+ returns the subscription object directly
        // Access properties using bracket notation for compatibility
        stripeSubscriptionDetails = {
          status: stripeSubscription.status as string,
          currentPeriodEnd: (stripeSubscription as unknown as { current_period_end: number }).current_period_end,
          cancelAtPeriodEnd: (stripeSubscription as unknown as { cancel_at_period_end: boolean }).cancel_at_period_end,
        };
      } catch (error) {
        // Subscription may have been deleted in Stripe
        console.error("[Subscription] Failed to retrieve subscription:", error);
      }
    }

    return {
      tier: user.tier,
      subscriptionId: user.subscriptionId,
      subscriptionStatus: user.subscriptionStatus,
      stripeCustomerId: user.stripeCustomerId,
      // Include Stripe subscription details if available
      stripeSubscription: stripeSubscriptionDetails,
    };
  }),

  /**
   * Create Stripe Customer Portal session
   * 
   * Allows users to manage their subscription (cancel, update payment method, etc.)
   * 
   * Requirements: 7.1
   */
  createPortalSession: protectedProcedure
    .input(
      z.object({
        returnUrl: z.string().url().optional(),
      }).strict()
    )
    .mutation(async ({ ctx, input }) => {
      const user = await ctx.db.user.findUnique({
        where: { id: ctx.user.id },
        select: {
          stripeCustomerId: true,
        },
      });

      if (!user?.stripeCustomerId) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "No subscription found",
        });
      }

      const baseUrl = getBaseUrl();
      const returnUrl = input.returnUrl ?? `${baseUrl}/dashboard`;

      try {
        const portalSession = await stripe.billingPortal.sessions.create({
          customer: user.stripeCustomerId,
          return_url: returnUrl,
        });

        return {
          portalUrl: portalSession.url,
        };
      } catch (error) {
        console.error("[Subscription] Portal session creation failed:", error);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to create portal session",
        });
      }
    }),
});
