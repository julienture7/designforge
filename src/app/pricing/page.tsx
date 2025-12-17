"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { SignedIn, SignedOut, UserButton, useAuth } from "@clerk/nextjs";
import { api } from "~/trpc/react";
import { useToastContext } from "~/contexts/ToastContext";

export default function PricingPage() {
  const router = useRouter();
  const toast = useToastContext();
  const { isSignedIn, isLoaded } = useAuth();
  
  const stripePriceId = process.env.NEXT_PUBLIC_STRIPE_PRICE_ID;
  
  const subscriptionStatus = api.subscription.getStatus.useQuery(undefined, {
    enabled: isLoaded && isSignedIn,
  });

  const createCheckout = api.subscription.createCheckout.useMutation({
    onSuccess: (data) => {
      if (data.checkoutUrl) {
        window.location.href = data.checkoutUrl;
      }
    },
    onError: (error) => {
      if (error.message.includes("already have")) {
        toast.info("You're already a Pro member!");
        router.push("/dashboard");
      } else {
        toast.error("Failed to start checkout", error.message);
      }
    },
  });

  const portal = api.subscription.createPortalSession.useMutation({
    onSuccess: (data) => {
      if (data.portalUrl) {
        window.location.href = data.portalUrl;
      }
    },
    onError: (error) => {
      toast.error("Couldn’t open billing portal", error.message);
    },
  });

  const handleUpgrade = () => {
    const priceId = stripePriceId;
    if (!priceId) {
      toast.error("Billing isn’t configured", "Missing NEXT_PUBLIC_STRIPE_PRICE_ID");
      return;
    }

    createCheckout.mutate({ priceId });
  };

  return (
    <div className="min-h-screen bg-white">
      {/* Navbar */}
      <nav className="navbar-animate border-b border-gray-100 bg-white">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex h-16 items-center justify-between">
            <Link href="/" className="flex items-center gap-2.5 transition-transform duration-200 hover:scale-105 active:scale-95 group">
              <div className="relative h-9 w-9 flex items-center justify-center">
                <div className="absolute inset-0 rounded-xl bg-gradient-to-br from-indigo-500 via-purple-500 to-pink-500 opacity-90 group-hover:opacity-100 transition-opacity shadow-lg shadow-indigo-500/30" />
                <svg className="relative h-5 w-5 text-white" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path d="M6 4h4c4.418 0 8 3.582 8 8s-3.582 8-8 8H6V4z" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
                  <path d="M9 12h5" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
                  <circle cx="19" cy="6" r="1.5" fill="currentColor" className="animate-pulse" />
                  <circle cx="21" cy="9" r="1" fill="currentColor" opacity="0.6" />
                </svg>
              </div>
              <span className="text-xl font-bold tracking-tight bg-gradient-to-r from-gray-900 via-gray-800 to-gray-700 bg-clip-text text-transparent">
                DesignForge
              </span>
            </Link>
            <div className="flex items-center gap-4">
              <SignedIn>
                <Link href="/dashboard" className="text-sm font-medium text-gray-500 hover:text-gray-900 transition-colors duration-200 link-underline">
                  Dashboard
                </Link>
                <UserButton
                  afterSignOutUrl="/"
                  appearance={{
                    elements: {
                      userButtonTrigger:
                        "rounded-full ring-1 ring-gray-200 bg-white shadow-sm hover:shadow-md hover:scale-105 active:scale-95 transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-blue-200",
                      userButtonAvatarBox: "h-9 w-9",
                    },
                  }}
                />
              </SignedIn>
              <SignedOut>
                <Link href="/sign-in" className="text-sm font-medium text-gray-500 hover:text-gray-900 transition-colors duration-200 link-underline">
                  Log In
                </Link>
                <Link href="/sign-up" className="text-sm font-medium text-gray-500 hover:text-gray-900 transition-colors duration-200 link-underline">
                  Sign Up
                </Link>
              </SignedOut>
            </div>
          </div>
        </div>
      </nav>

      <main className="mx-auto max-w-5xl px-4 py-16">
        <div className="text-center mb-12">
          <h1 className="animate-fade-in-up text-4xl font-bold text-gray-900 mb-4">Simple, Transparent Pricing</h1>
          <p className="animate-fade-in-up text-lg text-gray-500" style={{ animationDelay: '0.1s' }}>Choose the plan that works for you</p>
        </div>

        <div className="grid md:grid-cols-2 gap-8 max-w-3xl mx-auto">
          {/* Free Tier */}
          <div className="animate-fade-in-scale rounded-2xl border border-gray-200 p-8 transition-all duration-300 hover:shadow-lg hover:border-gray-300 hover:-translate-y-1" style={{ animationDelay: '0.15s' }}>
            <h3 className="text-lg font-semibold text-gray-900">Free</h3>
            <p className="mt-2 text-gray-500 text-sm">Perfect for trying out</p>
            <p className="mt-6">
              <span className="text-4xl font-bold text-gray-900">€0</span>
              <span className="text-gray-500">/month</span>
            </p>
            <ul className="mt-8 space-y-3 text-sm text-gray-600">
              <li className="flex items-center gap-2 transition-transform duration-200 hover:translate-x-1">
                <svg className="h-4 w-4 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                <span className="font-medium">20 credits (one-time on registration)</span>
              </li>
              <li className="flex items-center gap-2 transition-transform duration-200 hover:translate-x-1">
                <svg className="h-4 w-4 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                Basic mode: Devstral (2 credits)
                <span className="text-xs text-gray-400 ml-1">~10 generations</span>
              </li>
              <li className="flex items-center gap-2 transition-transform duration-200 hover:translate-x-1">
                <svg className="h-4 w-4 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                Medium mode: DeepSeek (4 credits)
                <span className="text-xs text-gray-400 ml-1">~5 generations</span>
              </li>
              <li className="flex items-center gap-2 transition-transform duration-200 hover:translate-x-1">
                <svg className="h-4 w-4 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                Public projects only
              </li>
              <li className="flex items-center gap-2 transition-transform duration-200 hover:translate-x-1">
                <svg className="h-4 w-4 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
                <span className="text-gray-400">No High mode (Gemini 3 Pro)</span>
              </li>
            </ul>
            <SignedOut>
              <Link
                href="/sign-up"
                className="mt-8 block w-full rounded-xl border border-gray-200 py-3 text-center text-sm font-semibold text-gray-900 hover:bg-gray-50 hover:border-gray-300 hover:shadow-sm active:scale-[0.98] transition-all duration-200"
              >
                Get Started
              </Link>
            </SignedOut>
            <SignedIn>
              <Link
                href="/dashboard"
                className="mt-8 block w-full rounded-xl border border-gray-200 py-3 text-center text-sm font-semibold text-gray-900 hover:bg-gray-50 hover:border-gray-300 hover:shadow-sm active:scale-[0.98] transition-all duration-200"
              >
                Continue to Dashboard
              </Link>
            </SignedIn>
          </div>

          {/* Pro Tier */}
          <div className="animate-fade-in-scale rounded-2xl border-2 border-gray-900 p-8 relative transition-all duration-300 hover:shadow-2xl hover:-translate-y-1 group" style={{ animationDelay: '0.2s' }}>
            <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-gray-900 text-white px-3 py-1 rounded-full text-xs font-semibold animate-bounce-subtle">
              Most Popular
            </div>
            <h3 className="text-lg font-semibold text-gray-900">Pro</h3>
            <p className="mt-2 text-gray-500 text-sm">Access to all AI models including premium</p>
            <p className="mt-6">
              <span className="text-4xl font-bold text-gray-900 transition-transform duration-200 inline-block group-hover:scale-105">€19.99</span>
              <span className="text-gray-500">/month</span>
            </p>
            <ul className="mt-8 space-y-3 text-sm text-gray-600">
              <li className="flex items-center gap-2 transition-transform duration-200 hover:translate-x-1">
                <svg className="h-4 w-4 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                <span className="font-medium">300 credits (one-time on subscription)</span>
              </li>
              <li className="flex items-center gap-2 transition-transform duration-200 hover:translate-x-1">
                <svg className="h-4 w-4 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                Private projects
              </li>
              <li className="flex items-center gap-2 transition-transform duration-200 hover:translate-x-1">
                <svg className="h-4 w-4 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                <span className="font-medium">Basic mode: Devstral</span>
                <span className="text-xs text-gray-400 ml-1">(2 credits) ~150 generations</span>
              </li>
              <li className="flex items-center gap-2 transition-transform duration-200 hover:translate-x-1">
                <svg className="h-4 w-4 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                <span className="font-medium">Medium mode: DeepSeek</span>
                <span className="text-xs text-gray-400 ml-1">(4 credits) ~75 generations</span>
              </li>
              <li className="flex items-center gap-2 transition-transform duration-200 hover:translate-x-1">
                <svg className="h-4 w-4 text-purple-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                <span className="font-medium">High mode: Gemini 3 Pro</span>
                <span className="text-xs text-gray-400 ml-1">(10 credits) ~30 generations</span>
              </li>
              <li className="flex items-center gap-2 transition-transform duration-200 hover:translate-x-1">
                <svg className="h-4 w-4 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                Priority support
              </li>
            </ul>
            <SignedOut>
              <Link
                href="/sign-up?redirect_url=/pricing"
                className="mt-8 block w-full rounded-xl bg-gray-900 py-3 text-center text-sm font-semibold text-white hover:bg-gray-800 hover:shadow-lg active:scale-[0.98] transition-all duration-200"
              >
                Sign up to upgrade
              </Link>
            </SignedOut>
            <SignedIn>
              {subscriptionStatus.data?.tier === "PRO" ? (
                <button
                  onClick={() => portal.mutate({ returnUrl: `${window.location.origin}/dashboard` })}
                  disabled={portal.isPending}
                  className="mt-8 block w-full rounded-xl border border-gray-200 bg-white py-3 text-center text-sm font-semibold text-gray-900 hover:bg-gray-50 hover:border-gray-300 hover:shadow-sm active:scale-[0.98] transition-all duration-200 disabled:opacity-50"
                >
                  {portal.isPending ? "Opening…" : "Manage Billing"}
                </button>
              ) : (
                <button
                  onClick={handleUpgrade}
                  disabled={createCheckout.isPending || !stripePriceId}
                  className="mt-8 block w-full rounded-xl bg-gray-900 py-3 text-center text-sm font-semibold text-white hover:bg-gray-800 hover:shadow-lg active:scale-[0.98] transition-all duration-200 disabled:opacity-50"
                >
                  {createCheckout.isPending ? "Loading..." : "Upgrade to Pro"}
                </button>
              )}
            </SignedIn>
          </div>
        </div>
      </main>
    </div>
  );
}
