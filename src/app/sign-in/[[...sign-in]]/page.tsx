"use client";

import { SignIn } from "@clerk/nextjs";
import Link from "next/link";
import { useSearchParams } from "next/navigation";

export default function SignInPage() {
  const searchParams = useSearchParams();
  const redirectUrl = searchParams.get("redirect_url");

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
          signUpUrl="/sign-up"
        />
      </div>
    </div>
  );
}
