"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@clerk/nextjs";
import { loadAllAnonymousProjects, getSessionId, type AnonymousProjectData } from "~/lib/utils/anonymous-session";

/**
 * My Design Page - Anonymous User Dashboard
 * 
 * This page allows anonymous users to:
 * - See all their temporarily saved designs (24h, up to 5)
 * - Continue editing any design
 * - Sign up to save permanently
 */
export default function MyDesignPage() {
  const router = useRouter();
  const { isSignedIn, isLoaded } = useAuth();
  const [projects, setProjects] = useState<AnonymousProjectData[]>([]);
  const [loading, setLoading] = useState(true);
  const [expiresAt, setExpiresAt] = useState<string | null>(null);
  const [timeRemaining, setTimeRemaining] = useState<string>("");

  // Redirect signed-in users to dashboard
  useEffect(() => {
    if (isLoaded && isSignedIn) {
      router.replace("/dashboard");
    }
  }, [isLoaded, isSignedIn, router]);

  // Load anonymous projects
  useEffect(() => {
    const loadProjects = async () => {
      const sessionId = getSessionId();
      if (!sessionId) {
        setLoading(false);
        return;
      }

      try {
        const result = await loadAllAnonymousProjects();
        if (result.success && result.projects) {
          setProjects(result.projects);
          setExpiresAt(result.expiresAt || null);
        }
      } catch (error) {
        console.error("Failed to load anonymous projects:", error);
      } finally {
        setLoading(false);
      }
    };

    void loadProjects();
  }, []);

  // Update time remaining
  useEffect(() => {
    if (!expiresAt) return;

    const updateTime = () => {
      const now = new Date().getTime();
      const expiry = new Date(expiresAt).getTime();
      const diff = expiry - now;

      if (diff <= 0) {
        setTimeRemaining("Expired");
        return;
      }

      const hours = Math.floor(diff / (1000 * 60 * 60));
      const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
      setTimeRemaining(`${hours}h ${minutes}m remaining`);
    };

    updateTime();
    const interval = setInterval(updateTime, 60000); // Update every minute
    return () => clearInterval(interval);
  }, [expiresAt]);

  if (!isLoaded || isSignedIn) {
    return null; // Will redirect
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-indigo-50">
      {/* Header */}
      <nav className="border-b border-slate-200 bg-white/80 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-14">
            <Link href="/" className="flex items-center gap-2.5 hover:opacity-90 transition-all duration-200">
              <div className="relative h-8 w-8 flex items-center justify-center">
                <div className="absolute inset-0 rounded-lg bg-gradient-to-br from-indigo-500 via-purple-500 to-pink-500 opacity-90" />
                <svg className="relative h-5 w-5 text-white" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path d="M6 4h4c4.418 0 8 3.582 8 8s-3.582 8-8 8H6V4z" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
                  <path d="M9 12h5" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
                </svg>
              </div>
              <span className="text-lg font-semibold tracking-tight bg-gradient-to-r from-slate-800 to-slate-600 bg-clip-text text-transparent">
                DesignForge
              </span>
            </Link>
            <div className="flex items-center gap-3">
              <Link
                href="/sign-in"
                className="text-sm font-medium text-slate-600 hover:text-slate-900 transition-colors"
              >
                Log In
              </Link>
              <Link
                href="/sign-up"
                className="inline-flex h-9 items-center justify-center rounded-full bg-gradient-to-r from-indigo-500 to-purple-500 px-4 text-sm font-medium text-white shadow-sm hover:shadow-md hover:scale-105 active:scale-95 transition-all duration-200"
              >
                Sign Up Free
              </Link>
            </div>
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <main className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-slate-900 mb-2">My Designs</h1>
          <p className="text-slate-600">Your temporary workspace (up to 5 designs)</p>
          {timeRemaining && timeRemaining !== "Expired" && (
            <p className="text-sm text-amber-600 mt-2 flex items-center justify-center gap-1">
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <polyline points="12 6 12 12 16 14" />
              </svg>
              {timeRemaining}
            </p>
          )}
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-16">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-indigo-600 border-t-transparent" />
          </div>
        ) : projects.length > 0 ? (
          <div className="space-y-6">
            {/* Projects Grid */}
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {projects.map((project) => (
                <ProjectCard key={project.projectId} project={project} />
              ))}
            </div>

            {/* Save Prompt */}
            <div className="bg-gradient-to-r from-indigo-50 to-purple-50 rounded-2xl p-6 border border-indigo-100">
              <div className="flex items-start gap-4">
                <div className="flex-shrink-0 w-10 h-10 rounded-full bg-gradient-to-r from-indigo-500 to-purple-500 flex items-center justify-center">
                  <svg className="w-5 h-5 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" />
                    <circle cx="12" cy="7" r="4" />
                  </svg>
                </div>
                <div className="flex-1">
                  <h3 className="font-semibold text-slate-900 mb-1">Save your work permanently</h3>
                  <p className="text-sm text-slate-600 mb-4">
                    Create a free account to save all your designs forever, access them from any device, and unlock Medium quality mode.
                  </p>
                  <Link
                    href="/sign-up"
                    className="inline-flex items-center gap-2 text-sm font-semibold text-indigo-600 hover:text-indigo-700 transition-colors"
                  >
                    Create Free Account
                    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M5 12h14" />
                      <path d="m12 5 7 7-7 7" />
                    </svg>
                  </Link>
                </div>
              </div>
            </div>
          </div>
        ) : (
          /* Empty State */
          <div className="text-center py-16">
            <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-slate-100 flex items-center justify-center">
              <svg className="w-8 h-8 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                <line x1="3" y1="9" x2="21" y2="9" />
                <line x1="9" y1="21" x2="9" y2="9" />
              </svg>
            </div>
            <h2 className="text-xl font-semibold text-slate-900 mb-2">No designs yet</h2>
            <p className="text-slate-600 mb-6 max-w-sm mx-auto">
              Start creating something amazing! Your designs will be saved here temporarily for 24 hours.
            </p>
            <Link
              href="/editor/new"
              className="inline-flex items-center gap-2 h-11 px-6 rounded-xl bg-gradient-to-r from-indigo-500 to-purple-500 text-white font-medium hover:shadow-lg hover:scale-105 transition-all duration-200"
            >
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
              Start Creating
            </Link>
          </div>
        )}
      </main>
    </div>
  );
}

/**
 * Project Card Component
 */
function ProjectCard({ project }: { project: AnonymousProjectData }) {
  // Extract first prompt from conversation
  const firstPrompt = project.conversationHistory?.find(m => m.role === "user")?.content || project.prompt || "Untitled Design";
  const truncatedPrompt = firstPrompt.length > 80 ? firstPrompt.slice(0, 80) + "..." : firstPrompt;
  
  // Format date
  const updatedAt = project.updatedAt ? new Date(project.updatedAt) : new Date();
  const timeAgo = getTimeAgo(updatedAt);

  return (
    <div className="bg-white rounded-2xl shadow-lg shadow-slate-200/50 border border-slate-200/60 overflow-hidden hover:shadow-xl transition-shadow duration-200">
      {/* Preview Thumbnail */}
      <div className="relative h-40 bg-slate-100 overflow-hidden">
        <iframe
          srcDoc={project.html}
          className="absolute inset-0 w-full h-full border-0 pointer-events-none"
          style={{ transform: "scale(0.4)", transformOrigin: "top left", width: "250%", height: "250%" }}
          title="Design Preview"
          sandbox="allow-scripts"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/20 to-transparent" />
      </div>

      {/* Project Info */}
      <div className="p-4">
        <p className="text-slate-900 font-medium text-sm line-clamp-2 mb-2">{truncatedPrompt}</p>
        <p className="text-xs text-slate-500 mb-3">{timeAgo}</p>
        
        <Link
          href={`/editor/new?restore=${project.projectId}`}
          className="w-full inline-flex items-center justify-center gap-2 h-9 rounded-lg bg-gradient-to-r from-indigo-600 to-purple-600 text-white text-sm font-semibold hover:from-indigo-700 hover:to-purple-700 transition-all duration-200 shadow-sm hover:shadow-md active:scale-[0.98]"
        >
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
          </svg>
          Continue Editing
        </Link>
      </div>
    </div>
  );
}

/**
 * Get human-readable time ago string
 */
function getTimeAgo(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  
  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  return date.toLocaleDateString();
}
