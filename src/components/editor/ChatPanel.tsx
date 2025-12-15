"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import type { ConversationMessage } from "@/types/editor";
import { useAuth } from "@clerk/nextjs";
import { api } from "~/trpc/react";

interface ChatPanelProps {
  projectId?: string;
  initialHistory?: ConversationMessage[];
  currentHtml?: string;
  onHtmlGenerated?: (html: string) => void;
  onLoadingChange?: (isLoading: boolean) => void;
  onGenerationComplete?: (
    html: string,
    finishReason: string,
    messages: ConversationMessage[],
    tokenUsage?: number
  ) => void;
  onMessagesUpdate?: (messages: ConversationMessage[]) => void;
  onError?: (code: string, message: string) => void;
}

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
}

/** Parse API error response into code + message */
function parseApiError(response: Response, data: unknown): { code: string; message: string } {
  const maybeData = data as Record<string, unknown> | null;
  const errorObj = maybeData?.error as Record<string, unknown> | string | null | undefined;
  
  // Extract code
  let code: string;
  if (typeof maybeData?.code === "string") {
    code = maybeData.code;
  } else if (typeof errorObj === "object" && errorObj && typeof errorObj.code === "string") {
    code = errorObj.code;
  } else if (response.status === 401) {
    code = "UNAUTHORIZED";
  } else if (response.status === 402) {
    code = "CREDITS_EXHAUSTED";
  } else if (response.status === 409) {
    code = "GENERATION_IN_PROGRESS";
  } else if (response.status === 429) {
    code = "RATE_LIMITED";
  } else {
    code = "API_ERROR";
  }

  // Extract message
  let message: string;
  if (typeof errorObj === "string") {
    message = errorObj;
  } else if (typeof maybeData?.message === "string") {
    message = maybeData.message;
  } else if (typeof errorObj === "object" && errorObj && typeof errorObj.message === "string") {
    message = errorObj.message;
  } else {
    message = "Request failed";
  }

  return { code, message };
}

export function ChatPanel({
  projectId,
  initialHistory = [],
  currentHtml = "",
  onHtmlGenerated,
  onLoadingChange,
  onGenerationComplete,
  onMessagesUpdate,
  onError,
}: ChatPanelProps) {
  const hasAutoSubmittedRef = useRef(false);
  const autoSubmitTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const submitPromptRef = useRef<((prompt: string) => Promise<void>) | undefined>(undefined);
  const pendingPromptRef = useRef<string | null>(null);

  const [messages, setMessages] = useState<Message[]>(() => 
    initialHistory.map((msg, i) => ({
      id: `init-${i}`,
      role: msg.role === "model" ? "assistant" as const : "user" as const,
      content: msg.content,
    }))
  );
  const [inputValue, setInputValue] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedMessages, setExpandedMessages] = useState<Set<string>>(new Set());
  const [refinementLevel, setRefinementLevel] = useState<"REFINED" | "ENHANCED" | "ULTIMATE">("REFINED");
  const refinementLevelRef = useRef<"REFINED" | "ENHANCED" | "ULTIMATE">("REFINED"); // Persist selection even on re-renders
  const [hasGenerated, setHasGenerated] = useState(() => !!currentHtml || initialHistory.length > 0); // Track if first generation happened
  const lockedRefinementLevel = useRef<"REFINED" | "ENHANCED" | "ULTIMATE" | null>(null); // Lock refinement after first gen
  
  // Sync ref with state
  useEffect(() => {
    refinementLevelRef.current = refinementLevel;
  }, [refinementLevel]);
  
  const { isSignedIn } = useAuth();
  const subscriptionStatus = api.subscription.getStatus.useQuery(undefined, {
    enabled: isSignedIn,
  });
  const userTier = subscriptionStatus.data?.tier ?? "FREE";
  const isPro = userTier === "PRO";
  
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const currentHtmlRef = useRef<string>(currentHtml);

  // Update currentHtml ref when prop changes
  useEffect(() => {
    currentHtmlRef.current = currentHtml;
    // If we have HTML and haven't marked as generated, mark it
    if (currentHtml && !hasGenerated) {
      setHasGenerated(true);
      if (isPro && !lockedRefinementLevel.current) {
        lockedRefinementLevel.current = refinementLevel;
      }
    }
  }, [currentHtml, hasGenerated, isPro, refinementLevel]);

  /**
   * Submit a prompt (shared by form submit + deep-link auto-submit).
   */
  const submitPrompt = useCallback(async (promptText: string) => {
    const trimmed = promptText.trim();
    if (!trimmed || isLoading) return;

    setInputValue("");
    setError(null);
    setIsLoading(true);
    onLoadingChange?.(true);

    // Add user message
    const userMessage: Message = {
      id: `user-${Date.now()}`,
      role: "user",
      content: trimmed,
    };
    
    const assistantMessageId = `assistant-${Date.now()}`;
    const assistantMessage: Message = {
      id: assistantMessageId,
      role: "assistant",
      content: "",
    };

    // Snapshot current messages for request payload (state updates are async)
    const priorMessages = messages;
    const currentHtmlSnapshot = currentHtmlRef.current;

    setMessages((prev) => [...prev, userMessage, assistantMessage]);

    // Abort any previous request
    abortControllerRef.current?.abort();
    abortControllerRef.current = new AbortController();

    try {
      // If this is the first generation, use /api/generate
      // Otherwise, use /api/edit for subsequent edits
      const isFirstGeneration = !hasGenerated && !currentHtmlSnapshot;
      
      if (isFirstGeneration) {
        // Lock refinement level on first generation
        if (isPro && !lockedRefinementLevel.current) {
          lockedRefinementLevel.current = refinementLevel;
        }
        
        const response = await fetch("/api/generate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            messages: [...priorMessages, userMessage].map((m) => ({
              role: m.role,
              content: m.content,
            })),
            projectId,
            currentHtml: currentHtmlSnapshot,
            prompt: trimmed,
            refinementLevel: isPro ? refinementLevelRef.current : undefined,
          }),
          signal: abortControllerRef.current.signal,
        });

        if (!response.ok) {
          const data = await response.json().catch(() => null);
          const { code, message } = parseApiError(response, data);
          const err = new Error(message) as Error & { code?: string };
          err.code = code;
          throw err;
        }

        const data = (await response.json()) as {
          html?: unknown;
          finishReason?: unknown;
          tokenUsage?: unknown;
        };

        const fullContent = typeof data?.html === "string" ? data.html : "";
        const finishReason = typeof data?.finishReason === "string" ? data.finishReason : "stop";
        const tokenUsage = typeof data?.tokenUsage === "number" ? data.tokenUsage : undefined;

        if (!fullContent) {
          const err = new Error("Empty HTML response") as Error & { code?: string };
          err.code = "EMPTY_RESPONSE";
          throw err;
        }

        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantMessageId ? { ...m, content: fullContent } : m
          )
        );

        // Mark as generated and update HTML ref
        setHasGenerated(true);
        currentHtmlRef.current = fullContent;

        // Notify completion (no streaming updates; swap preview atomically)
        onHtmlGenerated?.(fullContent);
        
        const finalHistory: ConversationMessage[] = [
          ...priorMessages.map((m) => ({
            role: m.role === "assistant" ? "model" as const : "user" as const,
            content: m.content,
          })),
          { role: "user" as const, content: trimmed },
          { role: "model" as const, content: fullContent },
        ];
        
        onGenerationComplete?.(fullContent, finishReason, finalHistory, tokenUsage);
      } else {
        // Subsequent requests: use /api/edit (returns SSE stream)
        const response = await fetch("/api/edit", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            currentHtml: currentHtmlSnapshot || "",
            editInstruction: trimmed,
            projectId,
          }),
          signal: abortControllerRef.current.signal,
        });

        if (!response.ok) {
          const data = await response.json().catch(() => null);
          const { code, message } = parseApiError(response, data);
          const err = new Error(message) as Error & { code?: string };
          err.code = code;
          throw err;
        }

        // Parse SSE stream
        const reader = response.body?.getReader();
        const decoder = new TextDecoder();
        let fullContent = "";
        let buffer = "";

        if (!reader) {
          throw new Error("No response body");
        }

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() || "";

          for (const line of lines) {
            if (line.startsWith("data: ")) {
              try {
                const data = JSON.parse(line.slice(6));
                if (data.type === "complete" && data.newHtml) {
                  fullContent = data.newHtml;
                } else if (data.type === "error") {
                  const err = new Error(data.message ?? "Edit failed") as Error & { code?: string };
                  err.code = data.code ?? "API_ERROR";
                  throw err;
                }
              } catch (e) {
                // Skip invalid JSON
              }
            }
          }
        }

        if (!fullContent) {
          const err = new Error("Empty HTML response") as Error & { code?: string };
          err.code = "EMPTY_RESPONSE";
          throw err;
        }

        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantMessageId ? { ...m, content: fullContent } : m
          )
        );

        // Update HTML ref
        currentHtmlRef.current = fullContent;

        // Notify completion
        onHtmlGenerated?.(fullContent);
        
        const finalHistory: ConversationMessage[] = [
          ...priorMessages.map((m) => ({
            role: m.role === "assistant" ? "model" as const : "user" as const,
            content: m.content,
          })),
          { role: "user" as const, content: trimmed },
          { role: "model" as const, content: fullContent },
        ];
        
        onGenerationComplete?.(fullContent, "stop", finalHistory, undefined);
      }

    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") {
        return; // Ignore abort errors
      }
      
      const errorMessage = err instanceof Error ? err.message : "Generation failed";
      const errorCode =
        err instanceof Error && "code" in err && typeof (err as any).code === "string"
          ? ((err as any).code as string)
          : "API_ERROR";

      setError(errorMessage);
      onError?.(errorCode, errorMessage);
      
      // Remove the empty assistant message on error
      setMessages((prev) => prev.filter((m) => m.id !== assistantMessageId));
    } finally {
      setIsLoading(false);
      onLoadingChange?.(false);
    }
  }, [
    messages,
    currentHtml,
    isLoading,
    isPro,
    hasGenerated,
    refinementLevel,
    onLoadingChange,
    onError,
    onGenerationComplete,
    onHtmlGenerated,
    projectId,
  ]);

  // Keep ref updated with latest submitPrompt function
  submitPromptRef.current = submitPrompt;

  // Scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isLoading]);

  // Reset auto-submit state when component mounts or projectId changes
  useEffect(() => {
    // Reset the auto-submit flag when we navigate to a new/different project
    hasAutoSubmittedRef.current = false;
    pendingPromptRef.current = null;
    
    // Clear any stale sessionStorage on mount
    // This prevents old queries from persisting across sessions
    return () => {
      // On unmount, clear pending refs
      pendingPromptRef.current = null;
    };
  }, [projectId]);

  // Deep link support: /editor/new?prompt=...
  // Auto-submits the prompt when arriving from home page after login
  useEffect(() => {
    // Don't process if there's already content (existing project)
    if (initialHistory.length > 0 || currentHtml) {
      // Clear any stale sessionStorage when loading existing project
      try {
        window.sessionStorage.removeItem("aidesigner_pending_editor_url");
      } catch {
        // Ignore
      }
      return;
    }
    
    // If already submitted successfully, don't retry
    if (hasAutoSubmittedRef.current) {
      return;
    }

    // Only check URL params first
    const url = new URL(window.location.href);
    let promptToSubmit = url.searchParams.get("prompt")?.trim() || null;
    
    // If found in URL, clear it immediately
    if (promptToSubmit) {
      url.searchParams.delete("prompt");
      window.history.replaceState(null, "", url.toString());
      // Also clear sessionStorage since we're using URL param
      try {
        window.sessionStorage.removeItem("aidesigner_pending_editor_url");
      } catch {
        // Ignore
      }
    }
    
    // If no URL prompt, check sessionStorage as fallback (for Clerk auth flow)
    if (!promptToSubmit) {
      try {
        const pendingUrl = window.sessionStorage.getItem("aidesigner_pending_editor_url");
        if (pendingUrl) {
          const pendingUrlObj = pendingUrl.startsWith('http') 
            ? new URL(pendingUrl)
            : new URL(pendingUrl, window.location.origin);
          promptToSubmit = pendingUrlObj.searchParams.get("prompt")?.trim() || null;
          
          // Always clear sessionStorage after reading to prevent re-use
          window.sessionStorage.removeItem("aidesigner_pending_editor_url");
        }
      } catch {
        // Ignore storage errors
      }
    }
    
    if (!promptToSubmit) {
      return;
    }
    
    // Store in ref so it survives Strict Mode cleanup/remount
    pendingPromptRef.current = promptToSubmit;
    
    // Submit after a short delay to ensure submitPromptRef is set
    autoSubmitTimeoutRef.current = setTimeout(() => {
      const prompt = pendingPromptRef.current;
      if (prompt && !hasAutoSubmittedRef.current) {
        // Mark as submitted INSIDE the callback
        hasAutoSubmittedRef.current = true;
        pendingPromptRef.current = null;
        void submitPromptRef.current?.(prompt);
      }
      autoSubmitTimeoutRef.current = null;
    }, 150);

    return () => {
      if (autoSubmitTimeoutRef.current) {
        clearTimeout(autoSubmitTimeoutRef.current);
        autoSubmitTimeoutRef.current = null;
      }
    };
  }, [projectId, initialHistory.length, currentHtml]);

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 200)}px`;
    }
  }, [inputValue]);

  // Update conversation history when messages change
  useEffect(() => {
    const conversationHistory: ConversationMessage[] = messages.map(m => ({
      role: m.role === "assistant" ? "model" : "user",
      content: m.content,
    }));
    onMessagesUpdate?.(conversationHistory);
  }, [messages, onMessagesUpdate]);

  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    await submitPrompt(inputValue);
  }, [inputValue, submitPrompt]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void submitPrompt(inputValue);
    }
  };

  const toggleExpanded = (id: string) => {
    setExpandedMessages(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  return (
    <div className="chat-panel">
      {/* Messages container */}
      <div className="chat-messages">
        <div className="chat-messages-inner">
          {messages.length === 0 && !isLoading && (
            <div className="chat-empty-state">
              <p>Describe what you want to build and I'll generate it for you.</p>
            </div>
          )}

          {messages.map((message) => (
            <div key={message.id} className="chat-message animate-fade-in-up">
              {message.role === "user" ? (
                <div className="chat-message-user">
                  <p>{message.content}</p>
                </div>
              ) : message.content ? (
                <div className="chat-message-assistant">
                  <button 
                    onClick={() => toggleExpanded(message.id)}
                    className="chat-expand-btn"
                    type="button"
                  >
                    <span>Generated Design</span>
                    <svg 
                      className={`chat-expand-icon ${expandedMessages.has(message.id) ? 'chat-expand-icon--open' : ''}`} 
                      viewBox="0 0 24 24" 
                      fill="none"
                      stroke="currentColor"
                      strokeWidth={2} 
                      strokeLinecap="round" 
                      strokeLinejoin="round"
                    >
                      <path d="m6 9 6 6 6-6" />
                    </svg>
                  </button>
                  
                  {expandedMessages.has(message.id) ? (
                    <div className="chat-code-preview animate-fade-in-scale">
                      <p>
                        {message.content.length > 500 
                          ? `${message.content.slice(0, 500)}...` 
                          : message.content}
                      </p>
                    </div>
                  ) : (
                    <p className="chat-success-indicator">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                        <path d="M5 13l4 4L19 7" />
                      </svg>
                      Design generated ({Math.round(message.content.length / 1000)}KB)
                    </p>
                  )}
                </div>
              ) : null}
            </div>
          ))}

          {isLoading && messages[messages.length - 1]?.role === "assistant" && !messages[messages.length - 1]?.content && (
            <div className="chat-message animate-fade-in">
              <div className="chat-loading">
                <span className="chat-loading-label">Generating...</span>
                <div className="chat-loading-indicator">
                  <div className="chat-loading-dots">
                    <span className="typing-dot" />
                    <span className="typing-dot" />
                    <span className="typing-dot" />
                  </div>
                  <span>Creating your design</span>
                </div>
              </div>
            </div>
          )}

          {error && (
            <div className="chat-error">
              {error}
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Upgrade CTA for free users - shown after first generation */}
      {!isPro && hasGenerated && (
        <div className="upgrade-cta mx-2 mb-2">
          <div className="upgrade-cta__icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
            </svg>
          </div>
          <div className="upgrade-cta__text">
            <div className="upgrade-cta__title">Unlock Pro Features</div>
            <div className="upgrade-cta__desc">Export HTML, multi-pass refinement & more</div>
          </div>
          <a href="/pricing" className="upgrade-cta__btn">
            Upgrade
          </a>
        </div>
      )}

      {/* Input area */}
      <div className="chat-input-container">
        <form onSubmit={handleSubmit} className="chat-input-form">
          <textarea
            ref={textareaRef}
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="What do you want to build?"
            disabled={isLoading}
            rows={1}
            className="chat-textarea"
          />
          {/* Refinement Level Selector */}
          {!hasGenerated && (
            <div className="refinement-selector">
              <div className="refinement-selector-header">
                <svg className="refinement-selector-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                </svg>
                <span>Refinement Level</span>
                {!isPro && (
                  <span className="refinement-pro-badge">PRO</span>
                )}
              </div>
              
              <div className="refinement-options">
                {([
                  { level: "REFINED" as const, label: "Refined", credits: 1, color: "blue" },
                  { level: "ENHANCED" as const, label: "Enhanced", credits: 2, color: "indigo" },
                  { level: "ULTIMATE" as const, label: "Ultimate", credits: 4, color: "purple" },
                ] as const).map(({ level, label, credits, color }) => {
                  const isSelected = isPro && refinementLevel === level;
                  const isDisabled = isLoading || !isPro;
                  
                  return (
                    <button
                      key={level}
                      type="button"
                      onClick={() => {
                        if (!isPro) {
                          onError?.("UPGRADE_REQUIRED", "Upgrade to Pro to access refinement levels.");
                          return;
                        }
                        setRefinementLevel(level);
                        refinementLevelRef.current = level;
                      }}
                      disabled={isDisabled}
                      className={`refinement-option ${isSelected ? `refinement-option--selected refinement-option--${color}` : ""} ${!isPro ? "refinement-option--locked" : ""}`}
                      title={!isPro ? "Upgrade to Pro" : `${label} (${credits} credit${credits > 1 ? "s" : ""})`}
                    >
                      <span className="refinement-option-label">{label}</span>
                      {isPro && <span className="refinement-option-credits">{credits}×</span>}
                    </button>
                  );
                })}
              </div>

              {!isPro && (
                <div className="refinement-upgrade-hint">
                  <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                  </svg>
                  <span>Upgrade to Pro for multi-pass refinement</span>
                </div>
              )}
            </div>
          )}
          
          {/* Locked refinement indicator (after first generation) */}
          {isPro && hasGenerated && lockedRefinementLevel.current && (
            <div className="refinement-locked">
              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                <path d="M7 11V7a5 5 0 0 1 10 0v4" />
              </svg>
              <span>
                <strong>{lockedRefinementLevel.current}</strong> · Edits cost 1 credit
              </span>
            </div>
          )}
          
          {/* Submit button */}
          <div className="chat-input-actions">
            <button
              type={isLoading ? "button" : "submit"}
              onClick={isLoading ? () => abortControllerRef.current?.abort() : undefined}
              disabled={!isLoading && !inputValue.trim()}
              className={`chat-submit-btn ${
                isLoading ? "chat-submit-btn--loading" : 
                inputValue.trim() ? "chat-submit-btn--active" : "chat-submit-btn--disabled"
              }`}
              aria-label={isLoading ? "Stop generation" : "Send message"}
            >
              {isLoading ? (
                <svg className="chat-submit-icon chat-submit-icon--spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 12a9 9 0 11-6.219-8.56" />
                </svg>
              ) : (
                <svg className="chat-submit-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
                  <path d="M5 12h14" />
                  <path d="m12 5 7 7-7 7" />
                </svg>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
