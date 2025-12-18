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
import { saveAnonymousProject, getOrCreateSession, loadAnonymousProject } from "~/lib/utils/anonymous-session";

interface EditorPageClientProps {
  projectId: string;
  initialHistory: ConversationMessage[];
  initialHtml: string;
  isAnonymous?: boolean; // New prop for anonymous users
}

export function EditorPageClient({
  projectId,
  initialHistory: providedInitialHistory,
  initialHtml: providedInitialHtml,
  isAnonymous = false,
}: EditorPageClientProps) {
  const isNewProject = projectId === "new";
  const [showHistoryWarning, setShowHistoryWarning] = useState(false);
  const [showSavePrompt, setShowSavePrompt] = useState(false);
  const [tempSaveExpiry, setTempSaveExpiry] = useState<string | null>(null);
  
  // State for content so we can update it after loading anonymous project
  const [initialHistory, setInitialHistory] = useState<ConversationMessage[]>(providedInitialHistory);
  const [initialHtml, setInitialHtml] = useState<string>(providedInitialHtml);
  const [isDataLoaded, setIsDataLoaded] = useState(!isAnonymous || !isNewProject);

  const latestHtmlRef = useRef<string>(providedInitialHtml);
  const latestHistoryRef = useRef<ConversationMessage[]>(providedInitialHistory);
  const promptRef = useRef<string>("");

  const toast = useToastContext();
  const { isSignedIn } = useAuth();

  // Load anonymous project on mount
  useEffect(() => {
    if (isAnonymous && isNewProject) {
      void (async () => {
        try {
          const result = await loadAnonymousProject();
          if (result.success && result.project) {
            setInitialHtml(result.project.html);
            
            // Map conversation history to correct type
            const mappedHistory: ConversationMessage[] = result.project.conversationHistory.map(msg => ({
              role: msg.role === "model" ? "model" : "user",
              content: msg.content,
            }));
            
            setInitialHistory(mappedHistory);
            latestHtmlRef.current = result.project.html;
            latestHistoryRef.current = mappedHistory;
            
            // Extract prompt
            const firstUserMsg = mappedHistory.find(m => m.role === "user");
            if (firstUserMsg) {
              promptRef.current = firstUserMsg.content;
            }
            
            if (result.expiresAt) {
              setTempSaveExpiry(result.expiresAt);
              setShowSavePrompt(true);
            }
            toast.info("Welcome back!", "Your temporary design has been restored.");
          }
        } catch (error) {
          console.error("Failed to load anonymous project:", error);
        } finally {
          setIsDataLoaded(true);
        }
      })();
    }
  }, [isAnonymous, isNewProject, toast]);

  const publishProject = api.project.update.useMutation();
  
  // Get user tier to check if Pro features should be available
  const subscriptionStatus = api.subscription.getStatus.useQuery(undefined, {
    enabled: isSignedIn === true && !isAnonymous,
  });
  const userTier = subscriptionStatus.data?.tier ?? "FREE";
  const isPro = userTier === "PRO" && !isAnonymous;

  // For authenticated users, use the auto-save hook
  const {
    saveStatus,
    hasPendingSave,
    save,
    onGenerationComplete: autoSaveOnGenerationComplete,
    createProjectForGeneration,
    resetProjectStatus,
    retryPendingSave,
    currentProjectId,
  } = useAutoSave({
    projectId: isNewProject || isAnonymous ? undefined : projectId,
    onProjectCreated: (newProjectId) => {
      console.log("Project created:", newProjectId);
      toast.success("Project created successfully");
    },
    onSaveError: (error) => {
      console.error("Auto-save error:", error);
      toast.error("Failed to save project", "Your changes are stored locally and will be retried");
    },
  });

  // Auto-save to Redis for anonymous users
  const saveAnonymousProjectToRedis = useCallback(async () => {
    if (!isAnonymous || !latestHtmlRef.current) return;

    // Use current refs to get latest data
    const currentHtml = latestHtmlRef.current;
    const currentHistory = latestHistoryRef.current;
    
    // Extract prompt from first user message if not already set
    if (!promptRef.current) {
      const firstUserMsg = currentHistory.find(m => m.role === "user");
      if (firstUserMsg) {
        promptRef.current = firstUserMsg.content;
      }
    }
    
    const currentPrompt = promptRef.current || "Untitled Design";

    const result = await saveAnonymousProject(
      currentHtml,
      currentPrompt,
      currentHistory
    );

    if (result.success && result.expiresAt) {
      setTempSaveExpiry(result.expiresAt);
      if (!showSavePrompt) {
        setShowSavePrompt(true);
      }
    }
  }, [isAnonymous, showSavePrompt]);

  const handleHtmlChange = useCallback((
    html: string,
    conversationHistory: ConversationMessage[]
  ) => {
    latestHtmlRef.current = html;
    latestHistoryRef.current = conversationHistory;
    
    if (isAnonymous) {
      // Debounce anonymous saves
      void saveAnonymousProjectToRedis();
    } else {
      save({
        htmlContent: html,
        conversationHistory,
      });
    }
  }, [save, isAnonymous, saveAnonymousProjectToRedis]);

  const handleGenerationComplete = useCallback((
    html: string,
    finishReason: string,
    conversationHistory: ConversationMessage[],
    tokenUsage?: number
  ) => {
    console.log("Generation complete:", { finishReason, htmlLength: html.length, tokenUsage });
    latestHtmlRef.current = html;
    latestHistoryRef.current = conversationHistory;
    
    // Extract prompt from first user message
    const firstUserMsg = conversationHistory.find(m => m.role === "user");
    if (firstUserMsg) {
      promptRef.current = firstUserMsg.content;
    }

    if (isAnonymous) {
      // Save to Redis for anonymous users
      void saveAnonymousProjectToRedis();
    } else {
      autoSaveOnGenerationComplete({
        htmlContent: html,
        conversationHistory,
        tokenUsage: tokenUsage ?? 0,
      });
    }
  }, [autoSaveOnGenerationComplete, isAnonymous, saveAnonymousProjectToRedis]);

  const handleError = useCallback((code: string, message: string) => {
    console.error("Editor error:", { code, message });
    
    // Reset project status to READY on generation failure
    if (!isAnonymous) {
      void resetProjectStatus();
    }
    
    const { title, details } = formatApiError(code, message);
    const action = createErrorAction(code, {
      onRetry: () => toast.info("Please try your request again"),
      onUpgrade: () => { window.location.href = "/pricing"; },
      onSignIn: () => { window.location.href = "/sign-in"; },
    });
    toast.error(title, details, action);
  }, [toast, resetProjectStatus, isAnonymous]);

  // Export HTML - free for everyone now
  const handleExport = useCallback(() => {
    const html = latestHtmlRef.current?.trim();
    if (!html) {
      toast.info("Nothing to export yet", "Generate a design first.");
      return;
    }

    const effectiveProjectId = currentProjectId ?? (isNewProject ? undefined : projectId);
    const fileBase = effectiveProjectId 
      ? `designforge-${effectiveProjectId}` 
      : isAnonymous 
        ? `designforge-${Date.now()}` 
        : "designforge";
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

    toast.success("Downloaded HTML", filename);
  }, [currentProjectId, isNewProject, projectId, toast, isAnonymous]);

  const handleShare = useCallback(async () => {
    if (isAnonymous) {
      toast.info("Sign up to share", "Create an account to publish and share your designs.");
      return;
    }

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
      toast.error("Couldn't publish", message);
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
  }, [currentProjectId, isNewProject, projectId, publishProject, toast, isAnonymous]);

  // Show save prompt banner after first generation for anonymous users
  useEffect(() => {
    if (isAnonymous && latestHtmlRef.current && !showSavePrompt) {
      // Initialize session on first load
      getOrCreateSession();
    }
  }, [isAnonymous, showSavePrompt]);

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

        {/* Anonymous save prompt banner */}
        {isAnonymous && showSavePrompt && (
          <div className="animate-fade-in-down flex items-center justify-between bg-gradient-to-r from-indigo-600 to-purple-600 px-4 py-2 text-sm text-white">
            <div className="flex items-center gap-2">
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <polyline points="12 6 12 12 16 14" />
              </svg>
              <span>
                Your design is saved for 24 hours. 
                <Link href="/sign-up" className="ml-1 underline font-medium hover:text-indigo-200">
                  Sign up free
                </Link>
                {" "}to save permanently!
              </span>
            </div>
            <button onClick={() => setShowSavePrompt(false)} className="text-white/80 hover:text-white transition-colors duration-200 hover:scale-110 active:scale-95">✕</button>
          </div>
        )}

        {/* Header */}
        <header className="navbar-animate relative z-20 flex h-14 shrink-0 items-center justify-between border-b border-slate-200 bg-white px-4 py-4 md:px-6">
          {/* Left: Logo / Back */}
          <div className="flex items-center gap-3">
            <Link href={isAnonymous ? "/" : "/dashboard"} className="flex items-center gap-2.5 hover:opacity-90 transition-all duration-200 hover:scale-105 active:scale-95 group">
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
              <span className="sr-only">{isAnonymous ? "Back to home" : "Back to dashboard"}</span>
            </Link>
            <span className="hidden sm:inline text-xs text-slate-400 transition-colors duration-200">Editor</span>
          </div>

          {/* Right: Actions */}
          <div className="flex items-center gap-3">
            {/* Show save status only for authenticated users */}
            {!isAnonymous && (
              <SaveStatusIndicator status={saveStatus} hasPendingSave={hasPendingSave} onRetry={retryPendingSave} />
            )}

            {/* Share button - disabled for anonymous */}
            {!isAnonymous && (
              <button
                onClick={() => void handleShare()}
                disabled={publishProject.isPending}
                className="inline-flex h-8 items-center justify-center rounded-full bg-slate-100 px-4 text-xs font-medium text-slate-700 shadow-sm transition-all duration-200 hover:bg-slate-200 hover:shadow-md hover:scale-105 active:scale-95 disabled:opacity-50 disabled:hover:scale-100"
                title="Publish this project and copy a share link"
              >
                {publishProject.isPending ? "Publishing…" : "Publish & Share"}
              </button>
            )}

            {/* Download button - free for everyone */}
            <button
              onClick={handleExport}
              className="inline-flex h-8 items-center justify-center gap-1.5 rounded-full bg-slate-100 px-4 text-xs font-medium text-slate-700 shadow-sm transition-all duration-200 hover:bg-slate-200 hover:shadow-md hover:scale-105 active:scale-95"
              title="Download the current HTML"
            >
              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="7 10 12 15 17 10" />
                <line x1="12" y1="15" x2="12" y2="3" />
              </svg>
              <span>Download</span>
            </button>

            {/* User menu or sign in/up buttons */}
            {isAnonymous ? (
              <div className="flex items-center gap-2">
                <Link
                  href="/sign-in"
                  className="inline-flex h-8 items-center justify-center rounded-full px-3 text-xs font-medium text-slate-600 transition-all duration-200 hover:text-slate-900 hover:bg-slate-100"
                >
                  Log In
                </Link>
                <Link
                  href="/sign-up"
                  className="inline-flex h-8 items-center justify-center rounded-full bg-gradient-to-r from-indigo-500 to-purple-500 px-4 text-xs font-medium text-white shadow-sm transition-all duration-200 hover:shadow-md hover:scale-105 active:scale-95"
                >
                  Sign Up Free
                </Link>
              </div>
            ) : (
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
            )}
          </div>
        </header>

        {/* Editor content */}
        <main className="flex-1 overflow-hidden animate-fade-in">
          {isDataLoaded ? (
            <ConnectedEditor
              key={projectId === "new" ? "new-project" : projectId} // Use stable key for new anonymous projects
              projectId={isAnonymous ? undefined : (currentProjectId ?? (isNewProject ? undefined : projectId))}
              initialHistory={initialHistory}
              initialHtml={initialHtml}
              isAnonymous={isAnonymous}
              onHtmlChange={handleHtmlChange}
              onGenerationStart={isAnonymous ? undefined : createProjectForGeneration}
              onGenerationComplete={handleGenerationComplete}
              onError={handleError}
            />
          ) : (
            <div className="h-full w-full flex items-center justify-center bg-gray-100">
              <div className="flex flex-col items-center gap-3">
                <div className="h-8 w-8 animate-spin rounded-full border-4 border-indigo-600 border-t-transparent" />
                <p className="text-sm font-medium text-slate-600">Restoring your session...</p>
              </div>
            </div>
          )}
        </main>
      </div>
    </EditorErrorBoundary>
  );
}

export default EditorPageClient;
