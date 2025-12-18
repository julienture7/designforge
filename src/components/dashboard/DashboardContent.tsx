"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { UserButton } from "@clerk/nextjs";
import { ProjectGrid } from "./ProjectGrid";
import { DashboardErrorBoundary } from "./DashboardErrorBoundary";
import { api } from "~/trpc/react";
import { useToastContext } from "~/contexts/ToastContext";
import { getSessionId, clearSession } from "~/lib/utils/anonymous-session";

interface DashboardContentProps {
  userName: string | null | undefined;
  userEmail: string | null | undefined;
  userTier: "FREE" | "PRO";
  userCredits: number;
  totalProjects: number;
  totalGenerations: number;
}

export function DashboardContent({
  userName,
  userEmail,
  userTier,
  userCredits,
  totalProjects,
  totalGenerations,
}: DashboardContentProps) {
  const displayName = userName || userEmail || "User";
  const [query, setQuery] = useState("");
  const toast = useToastContext();
  const hasMigratedRef = useRef(false);
  
  // Get utils to invalidate project list after migration
  const utils = api.useUtils();

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

  // Migrate anonymous project on first load
  useEffect(() => {
    if (hasMigratedRef.current) return;
    
    const migrateAnonymousProject = async () => {
      const sessionId = getSessionId();
      if (!sessionId) return;

      hasMigratedRef.current = true;

      try {
        const response = await fetch("/api/anonymous-project/migrate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sessionId }),
        });

        if (response.ok) {
          const data = await response.json();
          toast.success(
            "Project imported!",
            "Your design has been saved to your account."
          );
          // Clear the anonymous session
          clearSession();
          // Invalidate the project list to show the new project
          void utils.project.list.invalidate();
        } else {
          // Silently fail - the project might have expired
          clearSession();
        }
      } catch (error) {
        // Silently fail - don't disrupt dashboard load
        console.error("Failed to migrate anonymous project:", error);
        clearSession();
      }
    };

    void migrateAnonymousProject();
  }, [toast, utils.project.list]);

  return (
    <DashboardErrorBoundary>
      <div className="min-h-screen bg-white">
        {/* Navbar */}
        <nav className="navbar-animate border-b border-gray-100 bg-white">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="flex h-16 justify-between items-center">
              <Link href="/dashboard" className="flex items-center gap-2.5 transition-transform duration-200 hover:scale-105 active:scale-95 group">
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
                <Link href="/editor/new" className="text-sm font-medium text-gray-500 hover:text-gray-900 transition-colors duration-200 link-underline">New Design</Link>
                {userTier === "FREE" ? (
                  <Link href="/pricing" className="text-sm font-medium text-gray-500 hover:text-gray-900 transition-colors duration-200 link-underline">
                    Upgrade
                  </Link>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={() => portal.mutate({ returnUrl: `${window.location.origin}/dashboard` })}
                      disabled={portal.isPending}
                      className="hidden sm:inline-flex items-center justify-center rounded-full border border-gray-200 bg-white px-4 py-2 text-xs font-semibold text-gray-900 hover:bg-gray-50 hover:border-gray-300 hover:shadow-sm active:scale-95 transition-all duration-200 disabled:opacity-50"
                      title="Manage subscription, payment method, invoices"
                    >
                      {portal.isPending ? "Opening…" : "Manage Billing"}
                    </button>
                    <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700 border border-emerald-100 animate-pulse-soft">
                      Pro
                    </span>
                  </>
                )}
                <span 
                  className="hidden sm:inline text-xs text-gray-500 transition-colors duration-200" 
                  title={userTier === "PRO" ? `Pro credits: Refined costs 1, Enhanced costs 2, Ultimate costs 4` : undefined}
                >
                  {userTier === "PRO" 
                    ? `${userCredits} Pro credits`
                    : `${userCredits} credits`}
                </span>
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
              </div>
            </div>
          </div>
        </nav>

        <main className="mx-auto max-w-5xl px-4 py-12">
          {/* Workspace Header */}
          <div className="text-center mb-12">
            <h1 className="animate-fade-in-up text-2xl font-bold text-gray-900 mb-8">{displayName}&apos;s Workspace</h1>

            {/* Search Bar */}
            <div className="animate-fade-in-scale max-w-2xl mx-auto relative group" style={{ animationDelay: '0.1s' }}>
              <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none z-0">
                <svg className="h-5 w-5 text-gray-400 group-focus-within:text-blue-500 transition-colors duration-200" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              </div>
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="block w-full pl-12 pr-4 py-3 border border-gray-200 rounded-xl leading-5 bg-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-400 focus:scale-[1.01] transition-all duration-200 text-sm shadow-sm hover:shadow-md hover:border-gray-300 relative z-10"
                placeholder="Search projects by title..."
              />
            </div>
          </div>

          {/* Projects Grid */}
          <div className="mt-8 animate-fade-in" style={{ animationDelay: '0.2s' }}>
            <ProjectGrid query={query} />
          </div>
        </main>
      </div>
    </DashboardErrorBoundary>
  );
}

export default DashboardContent;
