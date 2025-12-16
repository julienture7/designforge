"use client";

import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { useAuth } from "@clerk/nextjs";
import { EditorLayout } from "./EditorLayout";
import { ChatPanel } from "./ChatPanel";
import { SandboxedCanvas } from "./SandboxedCanvas";
import { ViewportToggle, getViewportStyles, type ViewportType } from "./ViewportToggle";
import { RawHtmlViewer } from "@/components/ui/RawHtmlViewer";
import { processHtmlForSandbox } from "@/server/lib/html-processor";
import { api } from "~/trpc/react";
import type { ConversationMessage } from "@/types/editor";

/**
 * Create a protected version of HTML for free users
 * Adds watermark and disables common source extraction methods
 */
function createProtectedPreviewHtml(html: string): string {
  // Inject protection script and styles before closing </body> or at end
  const protectionCode = `
<style>
  /* Disable text selection */
  body, body * { 
    -webkit-user-select: none !important; 
    -moz-user-select: none !important; 
    -ms-user-select: none !important; 
    user-select: none !important; 
  }
  /* Watermark overlay */
  .df-watermark {
    position: fixed;
    bottom: 16px;
    right: 16px;
    z-index: 999999;
    padding: 8px 16px;
    background: linear-gradient(135deg, rgba(99,102,241,0.95) 0%, rgba(139,92,246,0.95) 100%);
    color: white;
    font-family: system-ui, -apple-serif, sans-serif;
    font-size: 12px;
    font-weight: 600;
    border-radius: 8px;
    box-shadow: 0 4px 12px rgba(0,0,0,0.15);
    pointer-events: auto;
    cursor: pointer;
    text-decoration: none;
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .df-watermark:hover { 
    transform: translateY(-2px); 
    box-shadow: 0 6px 16px rgba(0,0,0,0.2);
  }
  .df-watermark svg { width: 14px; height: 14px; }
</style>
<a href="/pricing" target="_top" class="df-watermark">
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M6 4h4c4.418 0 8 3.582 8 8s-3.582 8-8 8H6V4z"/><path d="M9 12h5"/></svg>
  DesignForge Preview
</a>
<script>
(function(){
  // Disable right-click context menu
  document.addEventListener('contextmenu', function(e) { e.preventDefault(); return false; });
  
  // Disable common keyboard shortcuts for viewing source
  document.addEventListener('keydown', function(e) {
    // Ctrl+U (view source), Ctrl+S (save), Ctrl+Shift+I (dev tools), F12
    if ((e.ctrlKey && (e.key === 'u' || e.key === 'U' || e.key === 's' || e.key === 'S')) ||
        (e.ctrlKey && e.shiftKey && (e.key === 'i' || e.key === 'I' || e.key === 'j' || e.key === 'J' || e.key === 'c' || e.key === 'C')) ||
        e.key === 'F12') {
      e.preventDefault();
      return false;
    }
  });
  
  // Disable drag
  document.addEventListener('dragstart', function(e) { e.preventDefault(); return false; });
})();
</script>`;

  // Insert before </body> if present, otherwise append
  if (html.includes('</body>')) {
    return html.replace('</body>', protectionCode + '</body>');
  }
  return html + protectionCode;
}

interface ConnectedEditorProps {
  /** Project ID for generation context */
  projectId?: string;
  /** Initial conversation history */
  initialHistory?: ConversationMessage[];
  /** Initial HTML content */
  initialHtml?: string;
  /** Callback when HTML content changes (for auto-save) */
  onHtmlChange?: (html: string, conversationHistory: ConversationMessage[]) => void;
  /** Callback when generation starts (to create project with GENERATING status) */
  onGenerationStart?: () => Promise<string | null>;
  /** Callback when generation completes */
  onGenerationComplete?: (
    html: string,
    finishReason: string,
    conversationHistory: ConversationMessage[],
    tokenUsage?: number
  ) => void;
  /** Callback when an error occurs */
  onError?: (code: string, message: string) => void;
}

/**
 * ConnectedEditor - Connects ChatPanel to SandboxedCanvas with real-time preview
 * 
 * This component:
 * - Manages the HTML state from AI generation
 * - Passes streamed HTML from ChatPanel to SandboxedCanvas
 * - Processes HTML through processHtmlForSandbox before rendering
 * - Updates preview in real-time as stream progresses
 * - Triggers auto-save callbacks on content changes
 * 
 * Requirements: 4.2, 4.12
 */
export function ConnectedEditor({
  projectId,
  initialHistory = [],
  initialHtml = "",
  onHtmlChange,
  onGenerationStart,
  onGenerationComplete,
  onError,
}: ConnectedEditorProps) {
  const { isSignedIn } = useAuth();
  
  // Get user tier to check if Pro features should be available
  const subscriptionStatus = api.subscription.getStatus.useQuery(undefined, {
    enabled: isSignedIn,
  });
  const userTier = subscriptionStatus.data?.tier ?? "FREE";
  const isPro = userTier === "PRO";
  
  // Current HTML content (raw, unprocessed)
  const [rawHtml, setRawHtml] = useState<string>(initialHtml);

  // Building state used to drive the preview loader overlay
  const [isBuilding, setIsBuilding] = useState(false);
  // Keep loader visible until the iframe finishes loading the new HTML
  const [isPreviewLoading, setIsPreviewLoading] = useState(false);

  // Progress indicator (approximation)
  const [progress, setProgress] = useState(0);
  const buildStartRef = useRef<number | null>(null);
  const previewStartRef = useRef<number | null>(null);

  // Track conversation history for auto-save
  const conversationHistoryRef = useRef<ConversationMessage[]>(initialHistory);

  // Viewport size for preview
  const [viewportType, setViewportType] = useState<ViewportType>("desktop");

  // Show raw HTML modal
  const [showRawHtml, setShowRawHtml] = useState(false);
  // Show full-page preview modal
  const [showFullPreview, setShowFullPreview] = useState(false);

  /**
   * Handle HTML generated (single-shot; no streaming)
   * Called by ChatPanel when generation completes.
   * Triggers debounced auto-save
   */
  const handleHtmlGenerated = useCallback((html: string) => {
    setRawHtml(html);
  }, []);

  /**
   * Handle generation complete
   * Called when the AI finishes generating content
   * Triggers immediate save with generation count increment
   */
  const handleGenerationComplete = useCallback((
    html: string,
    finishReason: string,
    messages: ConversationMessage[],
    tokenUsage?: number
  ) => {
    setIsPreviewLoading(true);
    setRawHtml(html);
    // Update conversation history ref
    conversationHistoryRef.current = messages;
    // Trigger generation complete callback with all data
    onGenerationComplete?.(html, finishReason, messages, tokenUsage);
    // Trigger save callback with full conversation history
    onHtmlChange?.(html, messages);
  }, [onGenerationComplete, onHtmlChange]);

  /**
   * Handle conversation history updates
   * Called when messages are added to the chat
   */
  const handleMessagesUpdate = useCallback((messages: ConversationMessage[]) => {
    conversationHistoryRef.current = messages;
  }, []);

  /**
   * Handle errors from generation
   */
  const handleError = useCallback((code: string, message: string) => {
    onError?.(code, message);
  }, [onError]);

  // Process HTML for sandbox rendering
  const processedHtml = rawHtml ? processHtmlForSandbox(rawHtml) : "";

  // Get viewport styles using the utility function
  const viewportStyles = getViewportStyles(viewportType);

  const progressLabel = useMemo(() => {
    if (isBuilding) return "Generating";
    if (isPreviewLoading) return "Loading preview";
    return "Idle";
  }, [isBuilding, isPreviewLoading]);

  const progressDetail = useMemo(() => {
    if (isBuilding) return "Drafting layout, copy, and components";
    if (isPreviewLoading) return "Applying styles, fonts, and images";
    return "";
  }, [isBuilding, isPreviewLoading]);

  // Smooth, phase-based progress approximation:
  // - While generating: 0% -> ~82%
  // - While preview loads: ~82% -> ~97%
  // - On iframe rendered: jump to 100% then hide overlay
  useEffect(() => {
    const show = isBuilding || isPreviewLoading;
    if (!show) {
      setProgress(0);
      buildStartRef.current = null;
      previewStartRef.current = null;
      return;
    }

    if (isBuilding && !buildStartRef.current) buildStartRef.current = Date.now();
    if (!isBuilding && isPreviewLoading && !previewStartRef.current) previewStartRef.current = Date.now();

    const tick = () => {
      setProgress((prev) => {
        const now = Date.now();

        if (isBuilding) {
          const start = buildStartRef.current ?? now;
          const elapsed = Math.max(0, now - start);
          // Ease toward 82% over ~180s (doubled for longer generation times).
          const target = 82 * (1 - Math.exp(-elapsed / 36000)); // ~82 by ~120-140s
          const next = Math.max(prev, Math.min(82, target));
          return Math.round(next);
        }

        if (isPreviewLoading) {
          const start = previewStartRef.current ?? now;
          const elapsed = Math.max(0, now - start);
          // Ease from current to 97% over ~6s, then crawl.
          const base = Math.max(prev, 82);
          const target = base + (97 - base) * (1 - Math.exp(-elapsed / 1200));
          return Math.round(Math.min(97, Math.max(base, target)));
        }

        return prev;
      });
    };

    // ~12fps is smooth enough, low overhead.
    const id = window.setInterval(tick, 80);
    tick();
    return () => window.clearInterval(id);
  }, [isBuilding, isPreviewLoading]);

  // Chat panel for generation with polish refinement
  const chatPanel = (
    <ChatPanel
      projectId={projectId}
      initialHistory={initialHistory}
      currentHtml={rawHtml}
      onHtmlGenerated={handleHtmlGenerated}
      onLoadingChange={(loading) => {
        setIsBuilding(loading);
        if (loading) {
          setIsPreviewLoading(true);
          buildStartRef.current = Date.now();
          previewStartRef.current = null;
          setProgress(1);
        }
      }}
      onGenerationStart={onGenerationStart}
      onGenerationComplete={handleGenerationComplete}
      onMessagesUpdate={handleMessagesUpdate}
      onError={handleError}
    />
  );

  // Preview panel with viewport controls and sandboxed canvas
  const previewPanel = (
    <div className="h-full flex flex-col bg-surface">
      {/* Viewport controls header */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-border bg-background">
        <span className="text-sm text-muted">Preview</span>
        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              if (!rawHtml) {
                onError?.("NO_CONTENT", "Generate a design first to view the preview.");
                return;
              }
              // Open full-page preview modal (available to all users)
              setShowFullPreview(true);
            }}
            disabled={!rawHtml}
            className="text-xs text-muted hover:text-foreground px-3 py-1 rounded-full bg-blue-500/10 hover:bg-blue-500/20 text-blue-600 transition-all duration-200 flex items-center gap-1 hover:scale-105 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
            title={!rawHtml ? "Generate a design first" : "View full-page preview"}
          >
            <svg className="w-3 h-3 transition-transform duration-200 group-hover:translate-x-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
            </svg>
            See Preview
          </button>
          <button
            onClick={() => {
              if (!rawHtml) {
                onError?.("NO_CONTENT", "Generate a design first to view raw HTML.");
                return;
              }
              if (!isPro) {
                onError?.("UPGRADE_REQUIRED", "Upgrade to Pro to export HTML code.");
                return;
              }
              setShowRawHtml(true);
            }}
            disabled={!rawHtml}
            className={`pro-feature-btn ${!isPro ? 'pro-feature-btn--locked' : ''}`}
            title={!rawHtml ? "Generate a design first" : (isPro ? "View Raw HTML" : "Upgrade to Pro")}
          >
            <svg className="pro-feature-btn__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="16 18 22 12 16 6" />
              <polyline points="8 6 2 12 8 18" />
            </svg>
            <span>HTML</span>
            {!isPro && <span className="pro-feature-btn__badge">PRO</span>}
          </button>
          <ViewportToggle
            selectedViewport={viewportType}
            onViewportChange={setViewportType}
          />
        </div>
      </div>

      {/* Preview container with viewport sizing */}
      <div className="flex-1 overflow-auto flex items-start justify-center p-4">
        <div
          style={viewportStyles}
          className={`relative bg-white ${viewportType !== "desktop" ? "shadow-lg rounded-lg overflow-hidden" : ""}`}
        >
          {processedHtml ? (
            <SandboxedCanvas 
              html={processedHtml} 
              className="h-full w-full" 
              onRendered={() => {
                setProgress(100);
                window.setTimeout(() => setIsPreviewLoading(false), 120);
              }}
            />
          ) : (
            <div className="h-full w-full flex items-center justify-center text-muted bg-surface animate-fade-in">
              <div className="text-center animate-float">
                <p className="text-lg mb-2">✨ No preview yet</p>
                <p className="text-sm">Start a conversation to generate UI</p>
              </div>
            </div>
          )}

          {/* Modern loader overlay (shown during build + until iframe loads new HTML) */}
          {(isBuilding || isPreviewLoading) && (
            <div className="absolute inset-0 z-20 flex items-center justify-center bg-white/70 backdrop-blur-sm">
              <div className="w-[min(520px,90%)] rounded-2xl border border-slate-200 bg-white/80 p-5 shadow-[0_20px_60px_-30px_rgba(0,0,0,0.35)]">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-sm font-medium text-slate-900">Building your page</p>
                    <p className="mt-1 text-xs text-slate-500">
                      Compiling layout, styles, and assets — preview will snap in when ready.
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="mt-0.5 h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                    <span className="text-xs font-semibold tabular-nums text-slate-900">{progress}%</span>
                  </div>
                </div>

                <div className="relative mt-4 h-2 w-full overflow-hidden rounded-full bg-slate-200">
                  <div className="absolute inset-0 opacity-50 [background:radial-gradient(circle_at_20%_0%,rgba(255,255,255,0.75),transparent_40%)]" />
                  <div
                    className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-indigo-600 via-fuchsia-500 to-amber-400 transition-[width] duration-200 ease-out"
                    style={{ width: `${Math.max(2, Math.min(progress, 100))}%` }}
                  />
                  <div className="absolute inset-y-0 left-0 w-[55%] rounded-full opacity-25 bg-gradient-to-r from-indigo-600 via-fuchsia-500 to-amber-400 animate-[oflow_1.1s_ease-in-out_infinite]" />
                </div>

                <div className="mt-3 flex items-center justify-between gap-3 text-[11px] text-slate-500">
                  <div className="flex items-center gap-2">
                  <span className="inline-flex h-4 w-4 items-center justify-center">
                    <span className="h-2.5 w-2.5 animate-spin rounded-full border-2 border-slate-400 border-t-transparent" />
                  </span>
                  <span className="font-mono tracking-wide uppercase">
                    {progressLabel}
                    <span className="ml-1 inline-block w-6 text-left animate-pulse">...</span>
                  </span>
                  </div>
                  <span className="hidden sm:inline text-slate-500">{progressDetail}</span>
                </div>

                <style>{`
                  @keyframes oflow {
                    0% { transform: translateX(-65%); }
                    55% { transform: translateX(60%); }
                    100% { transform: translateX(170%); }
                  }
                `}</style>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );

  return (
    <>
      <EditorLayout
        chatPanel={chatPanel}
        previewPanel={previewPanel}
      />

      {/* Raw HTML viewer modal */}
      {showRawHtml && (
        <RawHtmlViewer
          html={rawHtml}
          onClose={() => setShowRawHtml(false)}
        />
      )}

      {/* Full-page preview modal */}
      {showFullPreview && processedHtml && (
        <div 
          className="fixed inset-0 z-50 bg-black/95 flex flex-col"
          onClick={(e) => {
            // Close on backdrop click
            if (e.target === e.currentTarget) {
              setShowFullPreview(false);
            }
          }}
        >
          {/* Header with close button */}
          <div className="flex items-center justify-between px-4 py-3 bg-black/50 border-b border-white/10">
            <div className="flex items-center gap-3">
              <span className="text-sm text-white/80 font-medium">Full Page Preview</span>
              {!isPro && (
                <a 
                  href="/pricing" 
                  className="text-xs px-2 py-1 rounded-full bg-gradient-to-r from-indigo-500 to-purple-500 text-white font-medium hover:from-indigo-600 hover:to-purple-600 transition-all duration-200"
                >
                  Upgrade for HTML export
                </a>
              )}
            </div>
            <button
              onClick={() => setShowFullPreview(false)}
              className="text-white/60 hover:text-white transition-colors duration-200 p-2 rounded-lg hover:bg-white/10 active:scale-95"
              title="Close preview"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Full-page iframe preview - protected for free users */}
          <div 
            className="flex-1 overflow-hidden"
            onContextMenu={(e) => { if (!isPro) e.preventDefault(); }}
          >
            <iframe
              srcDoc={isPro ? processedHtml : createProtectedPreviewHtml(processedHtml)}
              className="w-full h-full border-0"
              sandbox={isPro 
                ? "allow-same-origin allow-scripts allow-forms allow-popups allow-modals" 
                : "allow-scripts allow-forms allow-popups allow-top-navigation"
              }
              title="Full page preview"
            />
          </div>
        </div>
      )}
    </>
  );
}

export default ConnectedEditor;
