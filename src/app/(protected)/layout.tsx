/**
 * Protected Routes Layout
 * 
 * Layout wrapper for all protected routes.
 * Authentication is enforced by Clerk middleware.
 */

import { auth } from "@clerk/nextjs/server";

export default async function ProtectedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { userId, redirectToSignIn } = await auth();

  // Double-check authentication (middleware should handle this, but belt-and-suspenders)
  if (!userId) {
    return redirectToSignIn();
  }

  return <>{children}</>;
}
