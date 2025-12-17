"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { SignedIn, SignedOut, UserButton, useAuth, useClerk } from "@clerk/nextjs";

const EXAMPLE_PROMPTS = [
  "A modern SaaS landing page with pricing",
  "Portfolio website for a photographer",
  "Restaurant homepage with menu section",
  "Startup landing page with waitlist",
  "E-commerce product showcase page",
  "Personal blog with minimalist design",
];

export default function Home() {
  const router = useRouter();
  const { isSignedIn, isLoaded } = useAuth();
  const clerk = useClerk();

  const [prompt, setPrompt] = useState("");
  const [placeholderText, setPlaceholderText] = useState("");
  const [isTyping, setIsTyping] = useState(true);
  const inputRef = useRef<HTMLInputElement>(null);
  const exampleIndexRef = useRef(0);
  const charIndexRef = useRef(0);

  // Animated placeholder effect
  useEffect(() => {
    // Don't animate if user has typed something
    if (prompt) {
      setPlaceholderText("Describe your website...");
      return;
    }

    const currentExample = EXAMPLE_PROMPTS[exampleIndexRef.current] ?? "";
    
    const tick = () => {
      if (isTyping) {
        // Typing forward
        if (charIndexRef.current < currentExample.length) {
          charIndexRef.current++;
          setPlaceholderText(currentExample.slice(0, charIndexRef.current));
        } else {
          // Pause at end, then start deleting
          setTimeout(() => setIsTyping(false), 2000);
        }
      } else {
        // Deleting
        if (charIndexRef.current > 0) {
          charIndexRef.current--;
          setPlaceholderText(currentExample.slice(0, charIndexRef.current));
        } else {
          // Move to next example
          exampleIndexRef.current = (exampleIndexRef.current + 1) % EXAMPLE_PROMPTS.length;
          setIsTyping(true);
        }
      }
    };

    const speed = isTyping ? 50 : 30;
    const timer = setInterval(tick, speed);
    return () => clearInterval(timer);
  }, [prompt, isTyping]);

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
        <Link href="/" className="flex items-center gap-2.5 transition-transform duration-200 hover:scale-105 active:scale-95 group">
          <div className="relative h-9 w-9 md:h-10 md:w-10 flex items-center justify-center">
            {/* Gradient background */}
            <div className="absolute inset-0 rounded-xl bg-gradient-to-br from-indigo-500 via-purple-500 to-pink-500 opacity-90 group-hover:opacity-100 transition-opacity shadow-lg shadow-indigo-500/30" />
            {/* Logo mark */}
            <svg className="relative h-5 w-5 md:h-6 md:w-6 text-white" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M6 4h4c4.418 0 8 3.582 8 8s-3.582 8-8 8H6V4z" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
              <path d="M9 12h5" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
              <circle cx="19" cy="6" r="1.5" fill="currentColor" className="animate-pulse" />
              <circle cx="21" cy="9" r="1" fill="currentColor" opacity="0.6" />
            </svg>
          </div>
          <span className="text-xl md:text-2xl font-bold tracking-tight bg-gradient-to-r from-gray-900 via-gray-800 to-gray-700 bg-clip-text text-transparent">
            DesignForge
          </span>
        </Link>

        <div className="flex items-center gap-6">
          <Link href="/pricing" className="text-sm font-medium text-gray-500 hover:text-gray-900 transition-colors duration-200 link-underline">
            Pricing
          </Link>
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
                placeholder={placeholderText || "Describe your website..."}
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
