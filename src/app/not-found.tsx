import Link from "next/link";
import { auth } from "@clerk/nextjs/server";

export default async function NotFound() {
  const { userId } = await auth();

  return (
    <main className="min-h-screen bg-background text-foreground flex items-center justify-center p-6">
      <div className="w-full max-w-md rounded-2xl border border-border bg-surface p-6 text-center">
        <p className="text-sm text-muted">404</p>
        <h1 className="mt-2 text-2xl font-semibold">Page not found</h1>
        <p className="mt-3 text-sm text-muted">
          The page you’re looking for doesn’t exist, or you don’t have access to it.
        </p>

        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <Link
            href="/"
            className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-foreground hover:bg-accent/80"
          >
            Go to home
          </Link>

          {userId ? (
            <>
              <Link
                href="/dashboard"
                className="rounded-lg border border-border bg-background px-4 py-2 text-sm font-medium hover:bg-muted/10"
              >
                Dashboard
              </Link>
              <Link
                href="/editor/new"
                className="rounded-lg border border-border bg-background px-4 py-2 text-sm font-medium hover:bg-muted/10"
              >
                New design
              </Link>
            </>
          ) : (
            <Link
              href="/sign-in"
              className="rounded-lg border border-border bg-background px-4 py-2 text-sm font-medium hover:bg-muted/10"
            >
              Sign in
            </Link>
          )}
        </div>
      </div>
    </main>
  );
}

