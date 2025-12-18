/**
 * Clerk Middleware for Protected Routes
 * 
 * Handles authentication using Clerk and protects routes.
 * Public routes are accessible without authentication.
 * 
 * Anonymous users can access:
 * - /editor/new - for anonymous generation (basic mode only)
 * - /api/generate - handles auth internally, allows anonymous basic generation
 * - /api/edit - handles auth internally, allows anonymous editing
 * - /api/anonymous-project - for temporary 24h project storage
 */

import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

// Define public routes that don't require authentication
const isPublicRoute = createRouteMatcher([
  "/",
  "/pricing(.*)",
  "/p(.*)",
  "/login(.*)",
  "/register(.*)",
  "/auth/signin(.*)",
  "/auth/signup(.*)",
  "/sign-in(.*)",
  "/sign-up(.*)",
  "/contact(.*)",
  "/my-design",     // Anonymous user dashboard for temporary designs
  "/editor/new",    // Anonymous generation - basic mode only
  "/api/cron(.*)",
  "/api/webhooks(.*)",
  "/api/proxy(.*)",
  "/api/generate",  // Handles auth internally - allows anonymous basic
  "/api/edit",      // Handles auth internally - allows anonymous editing
  "/api/anonymous-project(.*)",  // Temp project storage for anonymous users
]);

export default clerkMiddleware(async (auth, req) => {
  // Skip protection for preview API route - it handles auth internally
  // This route needs to be accessible from iframes without redirects
  const url = req.nextUrl.pathname;
  if (url.startsWith("/api/project/") && url.endsWith("/preview")) {
    // Don't call auth.protect() - let the route handler manage auth and return HTML
    return;
  }
  
  // Protect all routes except public ones
  if (!isPublicRoute(req)) {
    await auth.protect();
  }
});

export const config = {
  matcher: [
    // Skip Next.js internals and static files
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    // Always run for API routes
    "/(api|trpc)(.*)",
  ],
};
