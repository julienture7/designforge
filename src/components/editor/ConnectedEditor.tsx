"use client";

import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { useAuth } from "@clerk/nextjs";
import { EditorLayout } from "./EditorLayout";
import { ChatPanel } from "./ChatPanel";
import { SandboxedCanvas } from "./SandboxedCanvas";
import { ViewportToggle, VIEWPORT_CONFIGS, getViewportStyles, type ViewportType } from "./ViewportToggle";
import { RawHtmlViewer } from "@/components/ui/RawHtmlViewer";
import { processHtmlForSandbox } from "@/server/lib/html-processor";
import { api } from "~/trpc/react";
import type { ConversationMessage } from "@/types/editor";

function ensureViewportMeta(html: string): string {
  const input = html ?? "";
  if (!input) return input;

  if (/name\s*=\s*["']viewport["']/i.test(input)) return input;

  if (/<head[^>]*>/i.test(input)) {
    return input.replace(
      /<head[^>]*>/i,
      (match) =>
        `${match}\n<meta name="viewport" content="width=device-width, initial-scale=1.0">`
    );
  }

  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head><body>${input}</body></html>`;
}

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
  /** Whether the user is anonymous (not signed in) */
  isAnonymous?: boolean;
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
  isAnonymous = false,
  onHtmlChange,
  onGenerationStart,
  onGenerationComplete,
  onError,
}: ConnectedEditorProps) {
  const { isSignedIn } = useAuth();
  
  // Get user tier to check if Pro features should be available
  const subscriptionStatus = api.subscription.getStatus.useQuery(undefined, {
    enabled: isSignedIn === true && !isAnonymous,
  });
  const userTier = subscriptionStatus.data?.tier ?? "FREE";
  const isPro = userTier === "PRO" && !isAnonymous;
  
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
  const previewContainerRef = useRef<HTMLDivElement | null>(null);
  const [previewContainerWidth, setPreviewContainerWidth] = useState(0);

  /**
   * Handle HTML generated (single-shot; no streaming)
   * Called by ChatPanel when generation completes.
   */
  const handleHtmlGenerated = useCallback((html: string) => {
    console.log("[ConnectedEditor] handleHtmlGenerated called, html length:", html?.length);
    if (html) {
      setRawHtml(html);
      // Immediately start preview loading phase since we have HTML
      setIsPreviewLoading(true);
      previewStartRef.current = Date.now();
    }
  }, []);

  /**
   * Handle generation complete
   * Called when the AI finishes generating content
   */
  const handleGenerationComplete = useCallback((
    html: string,
    finishReason: string,
    messages: ConversationMessage[],
    tokenUsage?: number
  ) => {
    console.log("[ConnectedEditor] handleGenerationComplete called, html length:", html?.length);
    
    // Ensure HTML is set - rawHtml should already be set by handleHtmlGenerated
    // but set it again to be safe
    if (html) {
      setRawHtml(html);
    }
    
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

  // Auto-hide loading overlay when HTML is ready and building is done
  // The SandboxedCanvas onRendered callback is the primary mechanism,
  // but we have a fallback timer in case it doesn't fire
  useEffect(() => {
    if (processedHtml && !isBuilding && isPreviewLoading) {
      // Fallback: If onRendered doesn't fire within 2s, hide overlay anyway
      // This prevents the user from being stuck on loading forever
      const timer = setTimeout(() => {
        console.log("[ConnectedEditor] Fallback: Auto-hiding overlay after timeout");
        setIsPreviewLoading(false);
        setProgress(100);
      }, 2000);
      
      return () => clearTimeout(timer);
    }
  }, [processedHtml, isBuilding, isPreviewLoading]);

  // Get viewport styles using the utility function
  const viewportStyles = getViewportStyles(viewportType);
  const nonDesktopWidth =
    viewportType === "desktop" ? 0 : (typeof VIEWPORT_CONFIGS[viewportType].width === "number" ? VIEWPORT_CONFIGS[viewportType].width : 0);
  const nonDesktopHeight =
    viewportType === "desktop" ? 0 : (typeof VIEWPORT_CONFIGS[viewportType].height === "number" ? VIEWPORT_CONFIGS[viewportType].height : 0);
  const viewportScale = useMemo(() => {
    if (viewportType === "desktop") return 1;

    if (!nonDesktopWidth) return 1;

    const available = Math.max(0, previewContainerWidth - 32);
    if (!available) return 1;

    return Math.min(1, available / nonDesktopWidth);
  }, [nonDesktopWidth, previewContainerWidth, viewportType]);

  const fullPreviewSrcDoc = useMemo(() => {
    if (!processedHtml) return "";
    const normalized = ensureViewportMeta(processedHtml);
    return isPro ? normalized : createProtectedPreviewHtml(normalized);
  }, [isPro, processedHtml]);

  useEffect(() => {
    const el = previewContainerRef.current;
    if (!el) return;

    const update = () => setPreviewContainerWidth(el.getBoundingClientRect().width);
    update();

    const observer = new ResizeObserver(() => update());
    observer.observe(el);

    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!showFullPreview) return;

    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setShowFullPreview(false);
    };
    window.addEventListener("keydown", onKeyDown);

    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [showFullPreview]);

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

  // Smooth, phase-based progress approximation
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
          // Slower progress during building phase (AI generation takes 15-30s)
          const target = 82 * (1 - Math.exp(-elapsed / 36000));
          return Math.round(Math.max(prev, Math.min(82, target)));
        }
        if (isPreviewLoading) {
          const start = previewStartRef.current ?? now;
          const elapsed = Math.max(0, now - start);
          const base = Math.max(prev, 82);
          // Faster progress during preview loading (should be quick)
          const target = base + (97 - base) * (1 - Math.exp(-elapsed / 800));
          return Math.round(Math.min(97, Math.max(base, target)));
        }
        return prev;
      });
    };

    const id = window.setInterval(tick, 80);
    return () => {
      window.clearInterval(id);
    };
  }, [isBuilding, isPreviewLoading]);

  // Chat panel for generation with polish refinement
  const chatPanel = (
    <ChatPanel
      projectId={projectId}
      initialHistory={initialHistory}
      currentHtml={rawHtml}
      isAnonymous={isAnonymous}
      onHtmlGenerated={handleHtmlGenerated}
      onLoadingChange={(loading) => {
        setIsBuilding(loading);
        if (loading) {
          // Starting generation - show building overlay
          setIsPreviewLoading(true);
          buildStartRef.current = Date.now();
          previewStartRef.current = null;
          setProgress(1);
        }
        // When loading becomes false, don't change isPreviewLoading here
        // Let handleHtmlGenerated manage the preview loading state
        // This prevents race conditions where loading ends before HTML arrives
      }}
      onGenerationStart={onGenerationStart}
      onGenerationComplete={handleGenerationComplete}
      onMessagesUpdate={handleMessagesUpdate}
      onError={handleError}
    />
  );

  // Preview panel with viewport controls and sandboxed canvas
  const previewPanel = (
    <div className="h-full flex flex-col bg-surface relative">
      {/* Viewport controls header */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-border bg-background z-10">
        <span className="text-sm text-muted">Preview</span>
        <div className="flex items-center gap-2">
          {/* ... (buttons remain same) ... */}
          <button
            onClick={() => {
              if (!rawHtml) {
                onError?.("NO_CONTENT", "Generate a design first to view the preview.");
                return;
              }
              setShowFullPreview(true);
            }}
            disabled={!rawHtml}
            className="text-xs text-muted hover:text-foreground px-3 py-1 rounded-full bg-blue-500/10 hover:bg-blue-500/20 text-blue-600 transition-all duration-200 flex items-center gap-1 hover:scale-105 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
            title={!rawHtml ? "Generate a design first" : "View full-page preview"}
          >
            <svg className="w-3 h-3 transition-transform duration-200 group-hover:translate-x-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              <path d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
            </svg>
            See Preview
          </button>
          <button
            onClick={() => {
              if (!rawHtml) {
                onError?.("NO_CONTENT", "Generate a design first to view raw HTML.");
                return;
              }
              setShowRawHtml(true);
            }}
            disabled={!rawHtml}
            className="pro-feature-btn"
            title={!rawHtml ? "Generate a design first" : "View Raw HTML"}
          >
            <svg className="pro-feature-btn__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="16 18 22 12 16 6" />
              <polyline points="8 6 2 12 8 18" />
            </svg>
            <span>HTML</span>
          </button>
          <ViewportToggle
            selectedViewport={viewportType}
            onViewportChange={setViewportType}
          />
        </div>
      </div>

      {/* Preview container with viewport sizing */}
      <div ref={previewContainerRef} className="flex-1 overflow-auto p-4 relative">
        <div className={`flex items-start justify-center ${viewportType === "desktop" ? "h-full" : "min-h-full"}`}>
          <div
            style={
              viewportType === "desktop"
                ? viewportStyles
                : {
                    width: `${Math.round((VIEWPORT_CONFIGS[viewportType].width as number) * viewportScale)}px`,
                    height: `${Math.round((VIEWPORT_CONFIGS[viewportType].height as number) * viewportScale)}px`,
                  }
            }
            className={`relative bg-white ${viewportType !== "desktop" ? "shadow-lg rounded-lg overflow-hidden" : "h-full"}`}
          >
            {viewportType === "desktop" ? (
              processedHtml ? (
                <SandboxedCanvas
                  html={processedHtml}
                  className="h-full w-full"
                  onRendered={() => {
                    console.log("[ConnectedEditor] SandboxedCanvas onRendered fired");
                    setProgress(100);
                    window.setTimeout(() => {
                      console.log("[ConnectedEditor] Hiding preview loading overlay");
                      setIsPreviewLoading(false);
                    }, 120);
                  }}
                />
              ) : (
                <div className="h-full w-full flex items-center justify-center text-muted bg-surface animate-fade-in">
                  <div className="text-center animate-float">
                    <p className="text-lg mb-2">✨ No preview yet</p>
                    <p className="text-sm">Start a conversation to generate UI</p>
                  </div>
                </div>
              )
            ) : (
              <div
                style={{
                  width: `${VIEWPORT_CONFIGS[viewportType].width}px`,
                  height: `${VIEWPORT_CONFIGS[viewportType].height}px`,
                  transform: `scale(${viewportScale})`,
                  transformOrigin: "top left",
                }}
              >
                {processedHtml ? (
                  <SandboxedCanvas
                    html={processedHtml}
                    className="h-full w-full"
                    onRendered={() => {
                      console.log("[ConnectedEditor] SandboxedCanvas onRendered fired");
                      setProgress(100);
                      window.setTimeout(() => {
                        console.log("[ConnectedEditor] Hiding preview loading overlay");
                        setIsPreviewLoading(false);
                      }, 120);
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
              </div>
            )}
          </div>
        </div>

        {/* Loading Overlay - Positioned to cover visible area and stay centered */}
        {(isBuilding || isPreviewLoading) && (
          <div className="absolute top-0 left-0 right-0 bottom-0 z-50 flex items-center justify-center bg-white/80 backdrop-blur-sm p-4">
            <div className="w-[min(420px,90%)] rounded-3xl border border-slate-200/60 bg-white/95 p-8 shadow-[0_30px_70px_-20px_rgba(0,0,0,0.25)] animate-fade-in-scale">
              <div className="flex flex-col items-center text-center gap-6">
                {/* Progress Ring / Icon */}
                <div className="relative h-20 w-20 flex items-center justify-center">
                  <div className="absolute inset-0 animate-spin rounded-full border-[3px] border-indigo-100 border-t-indigo-600" />
                  <div className="h-12 w-12 rounded-full bg-indigo-50 flex items-center justify-center text-indigo-600">
                    <svg className="w-6 h-6 animate-pulse" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
                    </svg>
                  </div>
                </div>

                <div className="space-y-2">
                  <h3 className="text-lg font-bold text-slate-900">Building your design</h3>
                  <p className="text-sm text-slate-500 max-w-[280px]">
                    Our AI is crafting your interface. This typically takes 15-30 seconds.
                  </p>
                </div>

                {/* Progress Bar */}
                <div className="w-full space-y-3">
                  <div className="flex items-center justify-between text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                    <span>{progressLabel}</span>
                    <span className="text-indigo-600 tabular-nums">{progress}%</span>
                  </div>
                  <div className="relative h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                    <div
                      className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-indigo-600 to-violet-500 transition-[width] duration-500 ease-out"
                      style={{ width: `${Math.max(5, Math.min(progress, 100))}%` }}
                    />
                  </div>
                </div>

                <p className="text-[11px] text-slate-400 italic">
                  {progressDetail}
                </p>
              </div>
            </div>
          </div>
        )}
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
        <div className="fixed inset-0 z-[9999] bg-black flex flex-col">
          <button
            onClick={() => setShowFullPreview(false)}
            className="fixed top-3 right-3 z-20 text-gray-200 hover:text-white bg-gray-900/80 hover:bg-gray-800 transition-colors duration-200 p-3 rounded-xl border border-gray-700 active:scale-95"
            title="Exit preview"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
          <div className="relative z-10 flex items-center justify-between px-4 py-3 bg-gray-900 border-b border-gray-700 shrink-0">
            <button
              onClick={() => setShowFullPreview(false)}
              className="flex items-center gap-2 text-white bg-blue-600 hover:bg-blue-700 transition-colors duration-200 px-4 py-2 rounded-lg active:scale-95 font-medium"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
              </svg>
              <span>Back to Editor</span>
            </button>
            <div className="flex items-center gap-3">
              <button
                onClick={() => setShowFullPreview(false)}
                className="text-gray-400 hover:text-white transition-colors duration-200 p-2 rounded-lg hover:bg-gray-800 active:scale-95"
                title="Close preview"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>

          {/* Full-page iframe preview - protected for free users */}
          <div 
            className="flex-1 overflow-hidden"
            onContextMenu={(e) => { if (!isPro) e.preventDefault(); }}
          >
            <iframe
              srcDoc={fullPreviewSrcDoc}
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
