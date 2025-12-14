import { SignUp } from "@clerk/nextjs";
import Link from "next/link";

export default function SignUpPage() {
  return (
    <div className="min-h-screen bg-background">
      <header className="mx-auto max-w-7xl px-6 py-6">
        <Link href="/" className="text-sm text-muted hover:text-foreground">
          ← Back to home
        </Link>
      </header>
      <div className="flex items-center justify-center px-4 pb-10">
        <SignUp
          appearance={{
            elements: {
              rootBox: "mx-auto",
              card: "bg-white border border-border shadow-sm",
            },
          }}
          fallbackRedirectUrl="/dashboard"
          signInUrl="/sign-in"
        />
      </div>
    </div>
  );
}
