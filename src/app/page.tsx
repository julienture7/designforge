"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { SignedIn, SignedOut, UserButton, useAuth, useClerk } from "@clerk/nextjs";

export default function Home() {
  const router = useRouter();
  const { isSignedIn, isLoaded } = useAuth();
  const clerk = useClerk();

  const [prompt, setPrompt] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  // Clear stale pending URL when landing on home page
  // This prevents old queries from auto-loading when user returns to home
  useEffect(() => {
    if (!isLoaded) return;
    
    // If user is signed in and intentionally on home page (not mid-auth),
    // clear any stale pending URLs after a short delay
    // The delay allows the auth redirect flow to complete first
    if (isSignedIn && window.location.pathname === "/") {
      const timeout = setTimeout(() => {
        try {
          // Only clear if we're still on home page (user didn't navigate away)
          if (window.location.pathname === "/") {
            window.sessionStorage.removeItem("aidesigner_pending_editor_url");
          }
        } catch {
          // Ignore storage errors
        }
      }, 500);
      return () => clearTimeout(timeout);
    }
  }, [isLoaded, isSignedIn]);

  const startDesign = () => {
    if (!isLoaded) return;

    const trimmed = prompt.trim();
    if (!trimmed) {
      inputRef.current?.focus();
      return;
    }

    const editorUrl = `/editor/new?prompt=${encodeURIComponent(trimmed)}`;
    // Use absolute URL for Clerk redirects to ensure query parameters are preserved
    const absoluteEditorUrl = typeof window !== 'undefined' 
      ? `${window.location.origin}${editorUrl}`
      : editorUrl;

    // If already signed in, go directly to editor
    if (isSignedIn) {
      router.push(editorUrl);
      return;
    }

    // Preserve the user's prompt through auth (sessionStorage survives Clerk redirect)
    try {
      window.sessionStorage.setItem("aidesigner_pending_editor_url", editorUrl);
    } catch {
      // Ignore storage errors
    }

    // Open Clerk modal for sign-in
    if (clerk.loaded && clerk.openSignIn) {
      clerk.openSignIn({
        redirectUrl: absoluteEditorUrl,
        afterSignInUrl: absoluteEditorUrl,
        afterSignUpUrl: absoluteEditorUrl,
      });
    } else {
      // Fallback: redirect to sign-in page with redirect URL
      router.push(`/sign-in?redirect_url=${encodeURIComponent(absoluteEditorUrl)}`);
    }
  };

  return (
    <main className="flex min-h-screen flex-col bg-white text-gray-900">
      {/* Navbar */}
      <nav className="navbar-animate relative z-50 w-full px-6 py-6 flex justify-between items-center bg-white/90 backdrop-blur">
        <Link href="/" className="flex items-center gap-2 transition-transform duration-200 hover:scale-105 active:scale-95">
          <svg className="w-6 h-6 md:w-8 md:h-8 animate-float" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M12 2L3 14h6l-1 6 4-4 4 4-1-6h6L12 2z" />
          </svg>
          <span className="text-xl font-bold">DesignForge</span>
        </Link>

        <div className="flex items-center gap-6">
          <Link href="/pricing" className="text-sm font-medium text-gray-500 hover:text-gray-900 transition-colors duration-200 link-underline">
            Pricing
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
                    "rounded-full ring-1 ring-gray-200 shadow-sm hover:shadow-md transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-blue-200 hover:scale-105 active:scale-95",
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
      </nav>

      {/* Hero Content */}
      <div className="flex-1 flex flex-col items-center justify-center px-4 py-8 md:py-12 -mt-16">
        <div className="text-center max-w-4xl mx-auto mb-8 md:mb-12 w-full">
          <h1 className="animate-fade-in-up text-4xl sm:text-5xl md:text-6xl lg:text-7xl xl:text-8xl font-bold mb-3 md:mb-4 tracking-tighter text-center leading-[1.15]">
            <span className="block text-gray-900 pb-0.5">Design</span>
            <span className="block hero-gradient-text mt-0.5 mb-0.5">Award-Winning</span>
            <span className="block text-gray-900 mt-0.5 pb-0.5">Websites</span>
            <span className="block text-gray-600 text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-normal mt-2 tracking-normal">
              in Seconds
            </span>
          </h1>
          <p className="animate-fade-in-up text-gray-500 text-sm sm:text-base md:text-lg mb-6 md:mb-8 font-normal tracking-wide text-center max-w-xl mx-auto px-4" style={{ animationDelay: '0.1s' }}>
            AI-powered website generation. Describe what you want, get a production-ready design instantly.
          </p>
        </div>

        {/* Prompt Box */}
        <div className="w-full max-w-3xl px-4 animate-fade-in-scale stagger-3">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              startDesign();
            }}
            className="prompt-bar"
          >
            <div className="prompt-bar-inner">
              <input
                ref={inputRef}
                type="text"
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="Describe your website..."
                className="prompt-input"
                aria-label="Describe what you want to build"
              />

              <button
                type="submit"
                disabled={!isLoaded}
                className={`prompt-button group ${isLoaded && prompt.trim() ? "prompt-button--active" : ""}`}
              >
                <span className="prompt-button-text">
                  Generate
                  <svg 
                    className="w-4 h-4 md:w-5 md:h-5 transition-transform duration-300 group-hover:translate-x-0.5" 
                    fill="none" 
                    viewBox="0 0 24 24" 
                    stroke="currentColor" 
                    aria-hidden="true"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                  </svg>
                </span>
              </button>
            </div>
          </form>
        </div>

        {/* Examples - Simplified */}
        <div className="animate-fade-in-up mt-4 sm:mt-6 flex flex-wrap items-center justify-center gap-2 text-xs sm:text-sm text-gray-500 px-4" style={{ animationDelay: '0.2s' }}>
          {[
            "SaaS landing page",
            "Portfolio website",
            "Restaurant homepage",
          ].map((example, index) => (
            <button
              key={example}
              type="button"
              onClick={() => setPrompt(example)}
              className="rounded-full border border-gray-300 bg-white px-3 sm:px-4 py-1.5 sm:py-2 hover:bg-gray-50 hover:border-gray-400 hover:scale-105 active:scale-95 transition-all duration-200 text-gray-600 font-medium"
              style={{ animationDelay: `${0.25 + index * 0.05}s` }}
            >
              {example}
            </button>
          ))}
        </div>
      </div>
    </main>
  );
}
