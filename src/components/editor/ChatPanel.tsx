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
  const [hasGenerated, setHasGenerated] = useState(false); // Track if first generation happened
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
          let data: unknown = null;
          try {
            data = await response.json();
          } catch {
            // Non-JSON error response
          }

          const maybeData = data as any;

          const codeFromBody =
            typeof maybeData?.code === "string"
              ? maybeData.code
              : typeof maybeData?.error?.code === "string"
                ? maybeData.error.code
                : undefined;

          const messageFromBody =
            typeof maybeData?.error === "string"
              ? maybeData.error
              : typeof maybeData?.message === "string"
                ? maybeData.message
                : typeof maybeData?.error?.message === "string"
                  ? maybeData.error.message
                  : undefined;

          const statusFallbackCode =
            response.status === 401
              ? "UNAUTHORIZED"
              : response.status === 402
                ? "CREDITS_EXHAUSTED"
                : response.status === 409
                  ? "GENERATION_IN_PROGRESS"
                  : response.status === 429
                    ? "RATE_LIMITED"
                    : "API_ERROR";

          const err = new Error(messageFromBody ?? "Generation failed") as Error & { code?: string };
          err.code = codeFromBody ?? statusFallbackCode;
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
          let data: unknown = null;
          try {
            data = await response.json();
          } catch {
            // Non-JSON error response
          }

          const maybeData = data as any;

          const codeFromBody =
            typeof maybeData?.code === "string"
              ? maybeData.code
              : typeof maybeData?.error?.code === "string"
                ? maybeData.error.code
                : undefined;

          const messageFromBody =
            typeof maybeData?.error === "string"
              ? maybeData.error
              : typeof maybeData?.message === "string"
                ? maybeData.message
                : typeof maybeData?.error?.message === "string"
                  ? maybeData.error.message
                  : undefined;

          const statusFallbackCode =
            response.status === 401
              ? "UNAUTHORIZED"
              : response.status === 402
                ? "CREDITS_EXHAUSTED"
                : response.status === 409
                  ? "GENERATION_IN_PROGRESS"
                  : response.status === 429
                    ? "RATE_LIMITED"
                    : "API_ERROR";

          const err = new Error(messageFromBody ?? "Edit failed") as Error & { code?: string };
          err.code = codeFromBody ?? statusFallbackCode;
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

  // Reset auto-submit state when projectId changes (navigating to different editor)
  useEffect(() => {
    // Reset the auto-submit flag when we navigate to a new/different project
    hasAutoSubmittedRef.current = false;
    pendingPromptRef.current = null;
  }, [projectId]);

  // Deep link support: /editor/new?prompt=...
  // Auto-submits the prompt when arriving from home page after login
  // 
  // Strategy to handle React Strict Mode (which unmounts/remounts in dev):
  // We store the prompt in a ref, and only mark as submitted INSIDE the timeout callback.
  // This way, if the timeout is cleared during Strict Mode cleanup, we can retry on remount.
  useEffect(() => {
    // Don't process if there's already content (existing project)
    if (initialHistory.length > 0 || currentHtml) {
      return;
    }
    
    // If already submitted successfully, don't retry
    if (hasAutoSubmittedRef.current) {
      return;
    }

    // Only check URL params - don't use stored refs from previous navigations
    const url = new URL(window.location.href);
    let promptToSubmit = url.searchParams.get("prompt")?.trim() || null;
    
    // If found in URL, clear it immediately
    if (promptToSubmit) {
      url.searchParams.delete("prompt");
      window.history.replaceState(null, "", url.toString());
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
        // Mark as submitted INSIDE the callback, so if timeout is cleared, we can retry
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]); // Re-run when projectId changes

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
    <div className="flex h-full flex-col border-r border-slate-200 bg-white">
      {/* Messages container */}
      <div className="flex-1 overflow-y-auto px-5 py-4 pr-4">
        <div className="flex flex-col gap-y-2 gap-x-2">
          {messages.length === 0 && !isLoading && (
            <div className="py-8 text-center">
              <p className="text-sm text-slate-400">
                Describe what you want to build and I'll generate it for you.
              </p>
            </div>
          )}

          {messages.map((message, index) => (
            <div key={message.id} className="flex flex-col animate-fade-in-up" style={{ animationDelay: `${index * 0.05}s` }}>
              {message.role === "user" ? (
                <div className="flex flex-col items-end">
                  <div className="w-full rounded-xl bg-slate-100 px-4 py-3 text-sm leading-relaxed text-slate-800 transition-all duration-200 hover:bg-slate-50">
                    <div className="whitespace-pre-wrap">
                      <p>{message.content}</p>
                    </div>
                  </div>
                </div>
              ) : message.content ? (
                <div className="flex flex-col items-start">
                  <div className="w-full py-3 text-sm leading-relaxed text-slate-600">
                    <div className="mb-3">
                      <button 
                        onClick={() => toggleExpanded(message.id)}
                        className="mb-2 flex items-center gap-x-2 gap-y-2 text-xs text-slate-500 transition-all duration-200 ease-out-expo hover:text-slate-800 active:scale-95"
                      >
                        <span className="font-medium">Generated Design</span>
                        <svg 
                          className={`h-3 w-3 fill-none stroke-current transition-transform duration-300 ease-out-expo ${expandedMessages.has(message.id) ? 'rotate-180' : ''}`} 
                          viewBox="0 0 24 24" 
                          strokeWidth={2} 
                          strokeLinecap="round" 
                          strokeLinejoin="round"
                        >
                          <path d="m6 9 6 6 6-6" />
                        </svg>
                      </button>
                      {expandedMessages.has(message.id) && (
                        <div className="overflow-hidden animate-fade-in-scale">
                          <div className="max-h-[200px] overflow-y-auto rounded-lg bg-slate-50 p-3 pr-1 font-mono text-xs leading-relaxed text-slate-500 transition-all duration-200 hover:bg-slate-100">
                            <p className="break-all">
                              {message.content.length > 500 
                                ? `${message.content.slice(0, 500)}...` 
                                : message.content}
                            </p>
                          </div>
                        </div>
                      )}
                      {!expandedMessages.has(message.id) && (
                        <p className="text-xs text-slate-400 flex items-center gap-1.5">
                          <svg className="w-3.5 h-3.5 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                          </svg>
                          Design generated ({Math.round(message.content.length / 1000)}KB)
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              ) : null}
            </div>
          ))}

          {isLoading && messages[messages.length - 1]?.role === "assistant" && !messages[messages.length - 1]?.content && (
            <div className="flex flex-col items-start animate-fade-in">
              <div className="w-full py-3 text-sm leading-relaxed text-slate-600">
                <div className="mb-3">
                  <div className="mb-2 flex items-center gap-x-2 gap-y-2 text-xs text-slate-500">
                    <span className="font-medium">Generating...</span>
                  </div>
                  <div className="flex items-center gap-3 bg-slate-50 rounded-lg px-4 py-3">
                    <div className="flex items-center gap-1">
                      <span className="typing-dot h-2 w-2 rounded-full bg-blue-500"></span>
                      <span className="typing-dot h-2 w-2 rounded-full bg-blue-500"></span>
                      <span className="typing-dot h-2 w-2 rounded-full bg-blue-500"></span>
                    </div>
                    <span className="font-mono text-xs text-slate-500">Creating your design</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {error && (
            <div className="flex flex-col items-start">
              <div className="w-full rounded-lg bg-red-50 px-4 py-3 text-sm text-red-600">
                {error}
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Input area */}
      <div className="relative z-50 bg-white px-2 pb-2">
        <form 
          onSubmit={handleSubmit} 
          className="relative rounded-3xl p-2"
          style={{
            backgroundColor: '#ffffff',
            boxShadow: '0 0 0 1px rgba(0,0,0,0.05), 0 20px 25px -5px rgba(0,0,0,0.1), 0 8px 10px -6px rgba(0,0,0,0.1)',
          }}
        >
          <textarea
            ref={textareaRef}
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="What do you want to build?"
            disabled={isLoading}
            rows={1}
            data-editor-input="true"
            className="editor-input"
            style={{ 
              backgroundColor: '#ffffff',
              border: 'none',
              outline: 'none',
              color: '#334155',
              resize: 'none',
              width: '100%',
              minHeight: '40px',
              maxHeight: '200px',
              padding: '8px 12px',
              fontSize: '14px',
              lineHeight: '1.625',
              borderRadius: '8px',
              pointerEvents: 'auto',
              cursor: 'text',
            }}
          />
          <div className="px-3 pb-2">
            <div className="flex items-center gap-2 text-xs text-slate-600 mb-1">
              <span>Refinement Level:</span>
              {isPro && hasGenerated && lockedRefinementLevel.current && (
                <span className="text-slate-400 italic">(locked after first generation)</span>
              )}
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => {
                  if (!isPro) {
                    if (onError) {
                      onError("UPGRADE_REQUIRED", "This feature requires a Pro subscription. Upgrade to access refinement levels.");
                    }
                    return;
                  }
                  if (!hasGenerated) {
                    setRefinementLevel("REFINED");
                  }
                }}
                disabled={isLoading || (isPro && hasGenerated)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-200 active:scale-95 ${
                  isPro && (hasGenerated ? lockedRefinementLevel.current : refinementLevel) === "REFINED"
                    ? "bg-blue-100 text-blue-700 border border-blue-300 shadow-sm"
                    : "bg-white text-slate-600 border border-slate-200 hover:bg-slate-50 hover:border-slate-300 hover:shadow-sm"
                } disabled:opacity-50 disabled:cursor-not-allowed`}
                title={!isPro ? "Upgrade to Pro to access refinement levels" : (hasGenerated ? "Refinement level locked after first generation" : "Refined (1 credit)")}
              >
                Refined {isPro ? "(1 credit)" : ""}
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  if (!isPro) {
                    if (onError) {
                      onError("UPGRADE_REQUIRED", "This feature requires a Pro subscription. Upgrade to access refinement levels.");
                    }
                    return;
                  }
                  if (!hasGenerated) {
                    setRefinementLevel("ENHANCED");
                    refinementLevelRef.current = "ENHANCED";
                  }
                }}
                disabled={isLoading || (isPro && hasGenerated)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-200 active:scale-95 ${
                  isPro && (hasGenerated ? lockedRefinementLevel.current : refinementLevelRef.current) === "ENHANCED"
                    ? "bg-blue-100 text-blue-700 border border-blue-300 shadow-sm"
                    : "bg-white text-slate-600 border border-slate-200 hover:bg-slate-50 hover:border-slate-300 hover:shadow-sm"
                } disabled:opacity-50 disabled:cursor-not-allowed`}
                title={!isPro ? "Upgrade to Pro to access refinement levels" : (hasGenerated ? "Refinement level locked after first generation" : "Enhanced (2 credits)")}
              >
                Enhanced {isPro ? "(2 credits)" : ""}
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  if (!isPro) {
                    if (onError) {
                      onError("UPGRADE_REQUIRED", "This feature requires a Pro subscription. Upgrade to access refinement levels.");
                    }
                    return;
                  }
                  if (!hasGenerated) {
                    setRefinementLevel("ULTIMATE");
                    refinementLevelRef.current = "ULTIMATE";
                  }
                }}
                disabled={isLoading || (isPro && hasGenerated)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-200 active:scale-95 ${
                  isPro && (hasGenerated ? lockedRefinementLevel.current : refinementLevelRef.current) === "ULTIMATE"
                    ? "bg-purple-100 text-purple-700 border border-purple-300 shadow-sm"
                    : "bg-white text-slate-600 border border-slate-200 hover:bg-slate-50 hover:border-slate-300 hover:shadow-sm"
                } disabled:opacity-50 disabled:cursor-not-allowed`}
                title={!isPro ? "Upgrade to Pro to access refinement levels" : (hasGenerated ? "Refinement level locked after first generation" : "Ultimate (4 credits)")}
              >
                Ultimate {isPro ? "(4 credits)" : ""}
              </button>
            </div>
            {isPro && hasGenerated && (
              <div className="mt-1 text-xs text-slate-500">
                Subsequent edits cost 1 credit each
              </div>
            )}
            {!isPro && (
              <div className="mt-1 text-xs text-slate-500">
                Upgrade to Pro to access refinement levels
              </div>
            )}
          </div>
          <div className="flex items-end justify-between px-1 pb-1">
            <div className="flex items-center gap-x-2 gap-y-2" />
            <button
              type={isLoading ? "button" : "submit"}
              onClick={
                isLoading
                  ? () => abortControllerRef.current?.abort()
                  : undefined
              }
              disabled={!isLoading && !inputValue.trim()}
              className={`flex h-9 w-9 items-center justify-center rounded-full transition-all duration-200 ease-in-out shadow-sm ${
                isLoading
                  ? "bg-gray-900 text-white hover:bg-gray-800 active:scale-95"
                  : inputValue.trim()
                    ? "bg-gray-900 text-white hover:bg-gray-800 hover:shadow-md active:scale-95"
                    : "bg-gray-200 text-gray-400 cursor-not-allowed"
              }`}
            >
              {isLoading ? (
                <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M21 12a9 9 0 11-6.219-8.56" />
                </svg>
              ) : (
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
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
