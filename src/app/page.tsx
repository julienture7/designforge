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

  // If auth completes but Clerk doesn't navigate (e.g., modal close),
  // continue to the pending generation URL automatically.
  // Only run this on the home page (not on editor pages)
  useEffect(() => {
    if (!isLoaded || !isSignedIn) return;
    // Only redirect if we're still on the home page
    if (window.location.pathname !== "/") return;
    
    try {
      const pending = window.sessionStorage.getItem("aidesigner_pending_editor_url");
      if (!pending) return;
      console.log("[Home] Redirecting to pending editor URL:", pending);
      // DON'T remove sessionStorage here - let the editor page consume it
      // The editor page will remove it after reading the prompt
      router.push(pending);
    } catch {
      // Ignore storage errors
    }
  }, [isLoaded, isSignedIn, router]);

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
      <div className="flex-1 flex flex-col items-center justify-center px-4 -mt-16">
        <div className="text-center max-w-5xl mx-auto">
          <h1 className="animate-fade-in-up text-6xl md:text-8xl lg:text-9xl font-bold mb-6 tracking-tighter text-center leading-[0.9]">
            <span className="block text-gray-900">Design</span>
            <span className="block hero-gradient-text mt-2">Award-Winning</span>
            <span className="block text-gray-900 mt-2">Websites</span>
            <span className="block hero-gradient-text mt-2 text-5xl md:text-6xl lg:text-7xl font-normal tracking-normal">
              in Seconds, Not Weeks
            </span>
          </h1>
          <p className="animate-fade-in-up text-gray-600 text-xl md:text-2xl mb-4 font-medium tracking-tight text-center max-w-3xl mx-auto" style={{ animationDelay: '0.1s' }}>
            The only AI platform powered by Mixture of Experts architecture. 
            <span className="text-gray-900 font-semibold"> Generate production-ready designs</span> that win awards.
          </p>
          <p className="animate-fade-in-up text-gray-500 text-base md:text-lg mb-10 font-normal tracking-wide text-center max-w-2xl mx-auto" style={{ animationDelay: '0.15s' }}>
            Our proprietary system intelligently routes your request through specialized design models, selecting the optimal expert ensemble to create stunning, conversion-optimized websites.
          </p>
        </div>

        {/* Prompt box */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            startDesign();
          }}
          className="animate-fade-in-scale w-full max-w-3xl rounded-2xl shadow-lg border border-gray-200 p-2 flex items-center gap-2 bg-white transition-all duration-300 hover:shadow-xl hover:border-gray-300 focus-within:shadow-xl focus-within:border-blue-300"
          style={{ animationDelay: '0.2s' }}
        >
          <input
            ref={inputRef}
            type="text"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="e.g., Neo-brutalist landing page for a sushi bar with reservation CTA"
            className="flex-1 text-base py-3 px-4 outline-none border-none bg-transparent text-gray-900 transition-all duration-200"
            aria-label="Describe what you want to build"
          />

          <button
            type="submit"
            disabled={!isLoaded}
            className={`relative text-white px-6 py-2.5 rounded-xl text-sm font-semibold transition-all duration-300 flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed overflow-hidden group active:scale-95 ${
              isLoaded && prompt.trim()
                ? "btn-generate-animated hover:scale-105"
                : "bg-gray-900 hover:bg-gray-800 hover:scale-105"
            }`}
          >
            {/* Glow effect - only when prompt is valid */}
            {isLoaded && prompt.trim() && (
              <span className="btn-generate-glow" />
            )}
            
            <span className="relative z-10 flex items-center gap-2">
              Generate
              <svg 
                className="w-4 h-4 transition-transform duration-300 group-hover:translate-x-1" 
                fill="none" 
                viewBox="0 0 24 24" 
                stroke="currentColor" 
                aria-hidden="true"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
              </svg>
            </span>
          </button>
        </form>

        {/* Examples (fast, non-placeholder affordance) */}
        <div className="animate-fade-in-up mt-4 flex flex-wrap items-center justify-center gap-2 text-xs text-gray-500" style={{ animationDelay: '0.3s' }}>
          <span className="text-gray-400">Try:</span>
          {[
            "SaaS landing page for an AI meeting assistant with pricing + FAQ",
            "Portfolio for a product designer with case studies and a contact form",
            "Restaurant homepage with menu highlights and a booking section",
          ].map((example, index) => (
            <button
              key={example}
              type="button"
              onClick={() => setPrompt(example)}
              className="rounded-full border border-gray-200 bg-white px-3 py-1 hover:bg-gray-50 hover:border-gray-300 hover:scale-105 active:scale-95 transition-all duration-200"
              style={{ animationDelay: `${0.35 + index * 0.05}s` }}
            >
              {example}
            </button>
          ))}
        </div>
      </div>
    </main>
  );
}
