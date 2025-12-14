/**
 * User tRPC Router
 * 
 * Handles user profile operations.
 * 
 * Requirements: API Route Matrix (user.me)
 */
import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";

export const userRouter = createTRPCRouter({
  /**
   * Get current user profile
   * Returns user data including tier, credits, and subscriptionStatus
   * 
   * Requirements: API Route Matrix (user.me)
   */
  me: protectedProcedure.query(async ({ ctx }) => {
    const user = await ctx.db.user.findUnique({
      where: { id: ctx.user.id },
      select: {
        id: true,
        email: true,
        name: true,
        tier: true,
        credits: true,
        subscriptionStatus: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return user;
  }),
});
