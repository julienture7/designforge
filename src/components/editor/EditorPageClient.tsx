"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { UserButton, useAuth } from "@clerk/nextjs";
import { EditorErrorBoundary } from "./EditorErrorBoundary";
import { ConnectedEditor } from "./ConnectedEditor";
import { SaveStatusIndicator } from "./SaveStatusIndicator";
import { useAutoSave } from "~/hooks/useAutoSave";
import { useToastContext } from "~/contexts/ToastContext";
import { formatApiError, createErrorAction } from "~/lib/utils/toast";
import { api } from "~/trpc/react";
import type { ConversationMessage } from "@/types/editor";

interface EditorPageClientProps {
  projectId: string;
  initialHistory: ConversationMessage[];
  initialHtml: string;
}

export function EditorPageClient({
  projectId,
  initialHistory,
  initialHtml,
}: EditorPageClientProps) {
  const isNewProject = projectId === "new";
  const [showHistoryWarning, setShowHistoryWarning] = useState(false);
  const latestHtmlRef = useRef<string>(initialHtml);

  const toast = useToastContext();
  const { isSignedIn } = useAuth();

  const publishProject = api.project.update.useMutation();
  
  // Get user tier to check if Pro features should be available
  const subscriptionStatus = api.subscription.getStatus.useQuery(undefined, {
    enabled: isSignedIn,
  });
  const userTier = subscriptionStatus.data?.tier ?? "FREE";
  const isPro = userTier === "PRO";

  const {
    saveStatus,
    hasPendingSave,
    save,
    onGenerationComplete: autoSaveOnGenerationComplete,
    createProjectForGeneration,
    retryPendingSave,
    currentProjectId,
  } = useAutoSave({
    projectId: isNewProject ? undefined : projectId,
    onProjectCreated: (newProjectId) => {
      console.log("Project created:", newProjectId);
      toast.success("Project created successfully");
    },
    onSaveError: (error) => {
      console.error("Auto-save error:", error);
      toast.error("Failed to save project", "Your changes are stored locally and will be retried");
    },
  });

  const handleHtmlChange = useCallback((
    html: string,
    conversationHistory: ConversationMessage[]
  ) => {
    latestHtmlRef.current = html;
    save({
      htmlContent: html,
      conversationHistory,
    });
  }, [save]);

  const handleGenerationComplete = useCallback((
    html: string,
    finishReason: string,
    conversationHistory: ConversationMessage[],
    tokenUsage?: number
  ) => {
    console.log("Generation complete:", { finishReason, htmlLength: html.length, tokenUsage });
    latestHtmlRef.current = html;
    autoSaveOnGenerationComplete({
      htmlContent: html,
      conversationHistory,
      tokenUsage: tokenUsage ?? 0,
    });
  }, [autoSaveOnGenerationComplete]);

  const handleError = useCallback((code: string, message: string) => {
    console.error("Editor error:", { code, message });
    const { title, details } = formatApiError(code, message);
    const action = createErrorAction(code, {
      onRetry: () => toast.info("Please try your request again"),
      onUpgrade: () => { window.location.href = "/pricing"; },
      onSignIn: () => { window.location.href = "/sign-in"; },
    });
    toast.error(title, details, action);
  }, [toast]);

  const handleExport = useCallback(() => {
    const html = latestHtmlRef.current?.trim();
    if (!html) {
      toast.info("Nothing to export yet", "Generate a design first.");
      return;
    }

    const effectiveProjectId = currentProjectId ?? (isNewProject ? undefined : projectId);
    const fileBase = effectiveProjectId ? `aidesigner-${effectiveProjectId}` : "aidesigner";
    const filename = `${fileBase}.html`;

    const blob = new Blob([html], { type: "text/html;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);

    toast.success("Exported HTML", filename);
  }, [currentProjectId, isNewProject, projectId, toast]);

  const handleShare = useCallback(async () => {
    const effectiveProjectId = currentProjectId ?? (isNewProject ? undefined : projectId);
    if (!effectiveProjectId) {
      toast.info("Create a project first", "Generate something so we can publish and share it.");
      return;
    }

    // Ensure the project is publicly viewable before sharing.
    try {
      await publishProject.mutateAsync({ id: effectiveProjectId, visibility: "PUBLIC" });
    } catch (e) {
      const message = e instanceof Error ? e.message : "Failed to publish project";
      toast.error("Couldn’t publish", message);
      return;
    }

    const shareUrl = `${window.location.origin}/p/${effectiveProjectId}`;
    try {
      await navigator.clipboard.writeText(shareUrl);
      toast.success("Share link copied", shareUrl);
    } catch {
      // Clipboard can fail in some browsers/contexts (e.g., HTTP). Still show the URL.
      toast.success("Published", shareUrl);
    }
  }, [currentProjectId, isNewProject, projectId, publishProject, toast]);

  return (
    <EditorErrorBoundary>
      <div className="flex h-screen flex-col overflow-hidden bg-gray-200">
        {/* Warning banner */}
        {showHistoryWarning && (
          <div className="animate-fade-in-down flex items-center justify-between bg-yellow-900/90 px-4 py-2 text-sm text-yellow-200">
            <span>⚠️ Conversation history could not be restored</span>
            <button onClick={() => setShowHistoryWarning(false)} className="text-yellow-300 hover:text-yellow-100 transition-colors duration-200 hover:scale-110 active:scale-95">✕</button>
          </div>
        )}

        {/* Header */}
        <header className="navbar-animate relative z-20 flex h-14 shrink-0 items-center justify-between border-b border-slate-200 bg-white px-4 py-4 md:px-6">
          {/* Left: Logo / Back */}
          <div className="flex items-center gap-3">
            <Link href="/dashboard" className="flex items-center gap-2.5 hover:opacity-90 transition-all duration-200 hover:scale-105 active:scale-95 group">
              <div className="relative h-8 w-8 flex items-center justify-center">
                {/* Gradient background circle */}
                <div className="absolute inset-0 rounded-lg bg-gradient-to-br from-indigo-500 via-purple-500 to-pink-500 opacity-90 group-hover:opacity-100 transition-opacity shadow-lg shadow-indigo-500/25" />
                {/* Logo mark - stylized DF monogram */}
                <svg className="relative h-5 w-5 text-white" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  {/* D shape */}
                  <path d="M6 4h4c4.418 0 8 3.582 8 8s-3.582 8-8 8H6V4z" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
                  {/* F crossbar / spark accent */}
                  <path d="M9 12h5" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
                  {/* Spark dots */}
                  <circle cx="19" cy="6" r="1.5" fill="currentColor" className="animate-pulse" />
                  <circle cx="21" cy="9" r="1" fill="currentColor" opacity="0.6" />
                </svg>
              </div>
              <span className="hidden text-lg font-semibold tracking-tight bg-gradient-to-r from-slate-800 to-slate-600 bg-clip-text text-transparent md:block">
                DesignForge
              </span>
              <span className="sr-only">Back to dashboard</span>
            </Link>
            <span className="hidden sm:inline text-xs text-slate-400 transition-colors duration-200">Editor</span>
          </div>

          {/* Right: Actions */}
          <div className="flex items-center gap-3">
            <SaveStatusIndicator status={saveStatus} hasPendingSave={hasPendingSave} onRetry={retryPendingSave} />

            <button
              onClick={() => void handleShare()}
              disabled={publishProject.isPending}
              className="inline-flex h-8 items-center justify-center rounded-full bg-slate-100 px-4 text-xs font-medium text-slate-700 shadow-sm transition-all duration-200 hover:bg-slate-200 hover:shadow-md hover:scale-105 active:scale-95 disabled:opacity-50 disabled:hover:scale-100"
              title="Publish this project and copy a share link"
            >
              {publishProject.isPending ? "Publishing…" : "Publish & Share"}
            </button>

            <button
              onClick={() => {
                if (!isPro) {
                  // Show upgrade prompt for non-Pro users
                  handleError("UPGRADE_REQUIRED", "This feature requires a Pro subscription. Upgrade to export HTML.");
                  return;
                }
                handleExport();
              }}
              className={`pro-feature-btn ${!isPro ? 'pro-feature-btn--locked' : ''}`}
              title={isPro ? "Download the current HTML" : "Upgrade to Pro to export HTML"}
            >
              <svg className="pro-feature-btn__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="7 10 12 15 17 10" />
                <line x1="12" y1="15" x2="12" y2="3" />
              </svg>
              <span>Export</span>
              {!isPro && <span className="pro-feature-btn__badge">PRO</span>}
            </button>

            <UserButton
              afterSignOutUrl="/"
              appearance={{
                elements: {
                  userButtonTrigger:
                    "rounded-full ring-1 ring-slate-200 bg-white shadow-sm hover:shadow-md hover:scale-105 active:scale-95 transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-blue-200",
                  userButtonAvatarBox: "h-9 w-9",
                },
              }}
            />
          </div>
        </header>

        {/* Editor content */}
        <main className="flex-1 overflow-hidden animate-fade-in">
          <ConnectedEditor
            projectId={currentProjectId ?? (isNewProject ? undefined : projectId)}
            initialHistory={initialHistory}
            initialHtml={initialHtml}
            onHtmlChange={handleHtmlChange}
            onGenerationStart={createProjectForGeneration}
            onGenerationComplete={handleGenerationComplete}
            onError={handleError}
          />
        </main>
      </div>
    </EditorErrorBoundary>
  );
}

export default EditorPageClient;
