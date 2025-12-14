"use client";

import { SignIn } from "@clerk/nextjs";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect } from "react";

export default function SignInPage() {
  const searchParams = useSearchParams();
  const redirectUrl = searchParams.get("redirect_url");

  useEffect(() => {
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/08685b61-6ac0-4a56-9b63-af8f251df805',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'sign-in/page.tsx:12',message:'SignInPage mounted',data:{redirectUrl,currentUrl:typeof window !== 'undefined' ? window.location.href : '',allParams:typeof window !== 'undefined' ? Object.fromEntries(new URLSearchParams(window.location.search)) : {}},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
    // #endregion
  }, [redirectUrl]);

  return (
    <div className="min-h-screen bg-background">
      <header className="mx-auto max-w-7xl px-6 py-6">
        <Link href="/" className="text-sm text-muted hover:text-foreground">
          ← Back to home
        </Link>
      </header>
      <div className="flex items-center justify-center px-4 pb-10">
        <SignIn
          appearance={{
            elements: {
              rootBox: "mx-auto",
              card: "bg-white border border-border shadow-sm",
            },
          }}
          fallbackRedirectUrl={redirectUrl || "/dashboard"}
          signInFallbackRedirectUrl={redirectUrl || "/dashboard"}
          signUpUrl="/sign-up"
        />
      </div>
    </div>
  );
}
