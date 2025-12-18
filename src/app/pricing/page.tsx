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
      toast.error("Couldn't open billing portal", error.message);
    },
  });

  const handleUpgrade = () => {
    const priceId = stripePriceId;
    if (!priceId) {
      toast.error("Billing isn't configured", "Missing NEXT_PUBLIC_STRIPE_PRICE_ID");
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
              <Link href="/contact" className="text-sm font-medium text-gray-500 hover:text-gray-900 transition-colors duration-200 link-underline">
                Contact
              </Link>
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

      <main className="mx-auto max-w-6xl px-4 py-16">
        <div className="text-center mb-12">
          <h1 className="animate-fade-in-up text-4xl font-bold text-gray-900 mb-4">Simple, Transparent Pricing</h1>
          <p className="animate-fade-in-up text-lg text-gray-500" style={{ animationDelay: '0.1s' }}>Start free, upgrade when you need more</p>
        </div>

        <div className="grid md:grid-cols-3 gap-6 max-w-5xl mx-auto">
          {/* Guest Tier - No account needed */}
          <div className="animate-fade-in-scale rounded-2xl border border-gray-200 p-6 transition-all duration-300 hover:shadow-lg hover:border-gray-300 hover:-translate-y-1 bg-gradient-to-b from-gray-50 to-white" style={{ animationDelay: '0.1s' }}>
            <div className="flex items-center gap-2 mb-2">
              <h3 className="text-lg font-semibold text-gray-900">Guest</h3>
              <span className="px-2 py-0.5 text-xs font-medium bg-green-100 text-green-700 rounded-full">No signup</span>
            </div>
            <p className="text-gray-500 text-sm">Try it instantly</p>
            <p className="mt-4">
              <span className="text-3xl font-bold text-gray-900">Free</span>
              <span className="text-gray-500"> forever</span>
            </p>
            <ul className="mt-6 space-y-2.5 text-sm text-gray-600">
              <li className="flex items-center gap-2 transition-transform duration-200 hover:translate-x-1">
                <svg className="h-4 w-4 text-green-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                <span><strong>Unlimited</strong> Basic mode generations</span>
              </li>
              <li className="flex items-center gap-2 transition-transform duration-200 hover:translate-x-1">
                <svg className="h-4 w-4 text-green-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                <span><strong>Free</strong> editing with AI</span>
              </li>
              <li className="flex items-center gap-2 transition-transform duration-200 hover:translate-x-1">
                <svg className="h-4 w-4 text-green-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                <span>Download HTML files</span>
              </li>
              <li className="flex items-center gap-2 transition-transform duration-200 hover:translate-x-1">
                <svg className="h-4 w-4 text-green-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                <span>Temporary saves (24h)</span>
              </li>
              <li className="flex items-center gap-2 transition-transform duration-200 hover:translate-x-1">
                <svg className="h-4 w-4 text-gray-300 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
                <span className="text-gray-400">No Medium/High mode</span>
              </li>
            </ul>
            <Link
              href="/editor/new"
              className="mt-6 block w-full rounded-xl border border-gray-200 py-2.5 text-center text-sm font-semibold text-gray-900 hover:bg-gray-50 hover:border-gray-300 hover:shadow-sm active:scale-[0.98] transition-all duration-200"
            >
              Start Creating
            </Link>
          </div>

          {/* Free Tier - Account required */}
          <div className="animate-fade-in-scale rounded-2xl border border-gray-200 p-6 transition-all duration-300 hover:shadow-lg hover:border-gray-300 hover:-translate-y-1" style={{ animationDelay: '0.15s' }}>
            <h3 className="text-lg font-semibold text-gray-900">Free</h3>
            <p className="mt-1 text-gray-500 text-sm">Save projects & unlock Medium mode</p>
            <p className="mt-4">
              <span className="text-3xl font-bold text-gray-900">€0</span>
              <span className="text-gray-500">/month</span>
            </p>
            <ul className="mt-6 space-y-2.5 text-sm text-gray-600">
              <li className="flex items-center gap-2 transition-transform duration-200 hover:translate-x-1">
                <svg className="h-4 w-4 text-green-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                <span><strong>40 credits</strong> on registration</span>
              </li>
              <li className="flex items-center gap-2 transition-transform duration-200 hover:translate-x-1">
                <svg className="h-4 w-4 text-green-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                <span><strong>Unlimited</strong> Basic mode (free)</span>
              </li>
              <li className="flex items-center gap-2 transition-transform duration-200 hover:translate-x-1">
                <svg className="h-4 w-4 text-blue-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                <span><strong>Medium mode</strong> (4 credits) ~10 gens</span>
              </li>
              <li className="flex items-center gap-2 transition-transform duration-200 hover:translate-x-1">
                <svg className="h-4 w-4 text-green-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                <span>Permanent project saves</span>
              </li>
              <li className="flex items-center gap-2 transition-transform duration-200 hover:translate-x-1">
                <svg className="h-4 w-4 text-gray-300 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
                <span className="text-gray-400">No High mode</span>
              </li>
            </ul>
            <SignedOut>
              <Link
                href="/sign-up"
                className="mt-6 block w-full rounded-xl border border-gray-200 py-2.5 text-center text-sm font-semibold text-gray-900 hover:bg-gray-50 hover:border-gray-300 hover:shadow-sm active:scale-[0.98] transition-all duration-200"
              >
                Create Free Account
              </Link>
            </SignedOut>
            <SignedIn>
              <Link
                href="/dashboard"
                className="mt-6 block w-full rounded-xl border border-gray-200 py-2.5 text-center text-sm font-semibold text-gray-900 hover:bg-gray-50 hover:border-gray-300 hover:shadow-sm active:scale-[0.98] transition-all duration-200"
              >
                Go to Dashboard
              </Link>
            </SignedIn>
          </div>

          {/* Pro Tier */}
          <div className="animate-fade-in-scale rounded-2xl border-2 border-gray-900 p-6 relative transition-all duration-300 hover:shadow-2xl hover:-translate-y-1 group" style={{ animationDelay: '0.2s' }}>
            <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-gradient-to-r from-indigo-500 to-purple-500 text-white px-3 py-1 rounded-full text-xs font-semibold">
              Best Value
            </div>
            <h3 className="text-lg font-semibold text-gray-900">Pro</h3>
            <p className="mt-1 text-gray-500 text-sm">Premium AI & unlimited features</p>
            <p className="mt-4">
              <span className="text-3xl font-bold text-gray-900 transition-transform duration-200 inline-block group-hover:scale-105">€19.99</span>
              <span className="text-gray-500">/month</span>
            </p>
            <ul className="mt-6 space-y-2.5 text-sm text-gray-600">
              <li className="flex items-center gap-2 transition-transform duration-200 hover:translate-x-1">
                <svg className="h-4 w-4 text-green-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                <span><strong>300 credits</strong> on subscription</span>
              </li>
              <li className="flex items-center gap-2 transition-transform duration-200 hover:translate-x-1">
                <svg className="h-4 w-4 text-green-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                <span><strong>Unlimited</strong> Basic mode (free)</span>
              </li>
              <li className="flex items-center gap-2 transition-transform duration-200 hover:translate-x-1">
                <svg className="h-4 w-4 text-blue-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                <span><strong>Medium mode</strong> (4 credits) ~75 gens</span>
              </li>
              <li className="flex items-center gap-2 transition-transform duration-200 hover:translate-x-1">
                <svg className="h-4 w-4 text-purple-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                <span><strong>High mode</strong> (10 credits) ~30 gens</span>
              </li>
              <li className="flex items-center gap-2 transition-transform duration-200 hover:translate-x-1">
                <svg className="h-4 w-4 text-green-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                <span>Private projects & priority support</span>
              </li>
            </ul>
            <SignedOut>
              <Link
                href="/sign-up?redirect_url=/pricing"
                className="mt-6 block w-full rounded-xl bg-gray-900 py-2.5 text-center text-sm font-semibold text-white hover:bg-gray-800 hover:shadow-lg active:scale-[0.98] transition-all duration-200"
              >
                Get Started
              </Link>
            </SignedOut>
            <SignedIn>
              {subscriptionStatus.data?.tier === "PRO" ? (
                <button
                  onClick={() => portal.mutate({ returnUrl: `${window.location.origin}/dashboard` })}
                  disabled={portal.isPending}
                  className="mt-6 block w-full rounded-xl border border-gray-200 bg-white py-2.5 text-center text-sm font-semibold text-gray-900 hover:bg-gray-50 hover:border-gray-300 hover:shadow-sm active:scale-[0.98] transition-all duration-200 disabled:opacity-50"
                >
                  {portal.isPending ? "Opening…" : "Manage Billing"}
                </button>
              ) : (
                <button
                  onClick={handleUpgrade}
                  disabled={createCheckout.isPending || !stripePriceId}
                  className="mt-6 block w-full rounded-xl bg-gray-900 py-2.5 text-center text-sm font-semibold text-white hover:bg-gray-800 hover:shadow-lg active:scale-[0.98] transition-all duration-200 disabled:opacity-50"
                >
                  {createCheckout.isPending ? "Loading..." : "Upgrade to Pro"}
                </button>
              )}
            </SignedIn>
          </div>
        </div>

        {/* FAQ Section */}
        <div className="mt-20 max-w-3xl mx-auto">
          <h2 className="text-2xl font-bold text-gray-900 text-center mb-8">Frequently Asked Questions</h2>
          <div className="space-y-6">
            <div className="animate-fade-in-up" style={{ animationDelay: '0.3s' }}>
              <h3 className="font-semibold text-gray-900">Do I need an account to use DesignForge?</h3>
              <p className="mt-2 text-gray-600 text-sm">No! You can start generating websites immediately without signing up. Basic mode is completely free and unlimited. Create an account when you want to save projects permanently or access Medium mode.</p>
            </div>
            <div className="animate-fade-in-up" style={{ animationDelay: '0.35s' }}>
              <h3 className="font-semibold text-gray-900">What's the difference between Basic, Medium, and High mode?</h3>
              <p className="mt-2 text-gray-600 text-sm">Basic mode uses fast AI for quick generations. Medium mode uses more advanced AI for better quality. High mode (Pro only) uses premium AI models to create award-winning, highly polished designs.</p>
            </div>
            <div className="animate-fade-in-up" style={{ animationDelay: '0.4s' }}>
              <h3 className="font-semibold text-gray-900">What happens to my design if I don't sign up?</h3>
              <p className="mt-2 text-gray-600 text-sm">Designs are temporarily saved for 24 hours. You can download the HTML anytime. If you sign up within 24 hours, your design is automatically saved to your account.</p>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
