/**
 * useAutoSave Hook
 * 
 * Implements auto-save functionality with:
 * - Debounced project updates (5 second delay)
 * - localStorage fallback for offline/failed saves
 * - Save status indicator ("Saving..." / "Saved")
 * - Corrupted conversationHistory JSON handling
 * 
 * Requirements: 4.12, 5.1, 5.6, 5.7, 5.8
 */
"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { api } from "~/trpc/react";
import type { ConversationMessage } from "~/types/editor";

/**
 * Save status for UI indicator
 */
export type SaveStatus = "idle" | "saving" | "saved" | "error" | "offline";

/**
 * Pending save data stored in localStorage
 */
interface PendingSave {
  projectId: string;
  htmlContent: string;
  conversationHistory: ConversationMessage[];
  tokenUsage: number;
  timestamp: string;
}

/**
 * Debounce delay in milliseconds (5 seconds)
 */
const DEBOUNCE_DELAY_MS = 5000;

/**
 * localStorage key prefix for pending saves
 */
const PENDING_SAVE_KEY_PREFIX = "pendingProject:";

/**
 * Get localStorage key for a project
 */
function getPendingSaveKey(projectId: string): string {
  return `${PENDING_SAVE_KEY_PREFIX}${projectId}`;
}

/**
 * Safely parse JSON from localStorage
 */
function safeParsePendingSave(data: string | null): PendingSave | null {
  if (!data) return null;
  try {
    const parsed = JSON.parse(data) as unknown;
    if (
      typeof parsed === "object" &&
      parsed !== null &&
      "projectId" in parsed &&
      "htmlContent" in parsed &&
      "conversationHistory" in parsed
    ) {
      return parsed as PendingSave;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Validate conversation history array
 * Returns empty array if corrupted (per Requirements 5.8)
 */
function validateConversationHistory(
  history: unknown
): ConversationMessage[] {
  if (!Array.isArray(history)) {
    console.warn({
      event: "conversation_history_invalid",
      message: "Conversation history is not an array, using empty history",
      timestamp: new Date().toISOString(),
    });
    return [];
  }

  return history.filter(
    (msg): msg is ConversationMessage =>
      typeof msg === "object" &&
      msg !== null &&
      "role" in msg &&
      "content" in msg &&
      (msg.role === "user" || msg.role === "model") &&
      typeof msg.content === "string"
  );
}

interface UseAutoSaveOptions {
  /** Project ID - undefined for new projects */
  projectId?: string;
  /** Callback when project is created (for new projects) */
  onProjectCreated?: (newProjectId: string) => void;
  /** Callback when save fails */
  onSaveError?: (error: Error) => void;
}

interface UseAutoSaveReturn {
  /** Current save status */
  saveStatus: SaveStatus;
  /** Whether there's a pending save in localStorage */
  hasPendingSave: boolean;
  /** Trigger a save with the given data */
  save: (data: {
    htmlContent: string;
    conversationHistory: ConversationMessage[];
    tokenUsage?: number;
  }) => void;
  /** Handle generation complete - increments generationCount and appends to versionHistory */
  onGenerationComplete: (data: {
    htmlContent: string;
    conversationHistory: ConversationMessage[];
    tokenUsage: number;
  }) => void;
  /** Retry pending save from localStorage */
  retryPendingSave: () => void;
  /** Clear pending save from localStorage */
  clearPendingSave: () => void;
  /** Current project ID (may change after creation) */
  currentProjectId?: string;
}

export function useAutoSave({
  projectId,
  onProjectCreated,
  onSaveError,
}: UseAutoSaveOptions): UseAutoSaveReturn {
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const [hasPendingSave, setHasPendingSave] = useState(false);
  const [currentProjectId, setCurrentProjectId] = useState<string | undefined>(projectId);
  
  // Refs for debouncing
  const debounceTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const pendingDataRef = useRef<{
    htmlContent: string;
    conversationHistory: ConversationMessage[];
    tokenUsage: number;
  } | null>(null);
  
  // Flag to prevent duplicate project creation during race conditions
  const isCreatingProjectRef = useRef(false);
  // Ref to track current project ID to avoid stale closure issues
  const currentProjectIdRef = useRef<string | undefined>(projectId);
  
  // Keep ref in sync with state and prop changes
  useEffect(() => {
    currentProjectIdRef.current = currentProjectId;
  }, [currentProjectId]);
  
  // Update ref when projectId prop changes
  useEffect(() => {
    if (projectId !== currentProjectIdRef.current) {
      currentProjectIdRef.current = projectId;
      setCurrentProjectId(projectId);
    }
  }, [projectId]);

  // tRPC mutations
  const createMutation = api.project.create.useMutation();
  const updateMutation = api.project.update.useMutation();
  const generationCompleteMutation = api.project.onGenerationComplete.useMutation();

  // Check for pending save on mount
  useEffect(() => {
    if (currentProjectId) {
      const key = getPendingSaveKey(currentProjectId);
      const pendingSave = safeParsePendingSave(localStorage.getItem(key));
      setHasPendingSave(!!pendingSave);
    }
  }, [currentProjectId]);

  /**
   * Save data to localStorage as fallback
   */
  const saveToLocalStorage = useCallback((data: {
    projectId: string;
    htmlContent: string;
    conversationHistory: ConversationMessage[];
    tokenUsage: number;
  }) => {
    try {
      const pendingSave: PendingSave = {
        ...data,
        timestamp: new Date().toISOString(),
      };
      localStorage.setItem(
        getPendingSaveKey(data.projectId),
        JSON.stringify(pendingSave)
      );
      setHasPendingSave(true);
      setSaveStatus("offline");
    } catch (error) {
      console.error("Failed to save to localStorage:", error);
    }
  }, []);

  /**
   * Clear pending save from localStorage
   */
  const clearPendingSave = useCallback(() => {
    if (currentProjectId) {
      localStorage.removeItem(getPendingSaveKey(currentProjectId));
      setHasPendingSave(false);
    }
  }, [currentProjectId]);

  /**
   * Perform the actual save operation
   */
  const performSave = useCallback(async (data: {
    htmlContent: string;
    conversationHistory: ConversationMessage[];
    tokenUsage: number;
  }) => {
    // Validate conversation history
    const validatedHistory = validateConversationHistory(data.conversationHistory);

    setSaveStatus("saving");

    try {
      // Use ref to check current project ID (avoids stale closure issues)
      const projectIdToUse = currentProjectIdRef.current;
      
      if (!projectIdToUse) {
        // Check if we're already creating a project (prevent race condition)
        if (isCreatingProjectRef.current) {
          console.log("Project creation already in progress, skipping duplicate save");
          setSaveStatus("idle");
          return;
        }
        
        // Set flag to prevent duplicate creation
        isCreatingProjectRef.current = true;
        
        try {
          // Create new project
          const result = await createMutation.mutateAsync({
            title: "Untitled Project",
            htmlContent: data.htmlContent,
            conversationHistory: validatedHistory,
          });
          
          // Update both state and ref immediately
          setCurrentProjectId(result.id);
          currentProjectIdRef.current = result.id;
          onProjectCreated?.(result.id);
          
          // Update URL without full page reload
          window.history.replaceState(null, "", `/editor/${result.id}`);
        } finally {
          isCreatingProjectRef.current = false;
        }
      } else {
        // Update existing project
        await updateMutation.mutateAsync({
          id: projectIdToUse,
          htmlContent: data.htmlContent,
          conversationHistory: validatedHistory,
          tokenUsage: data.tokenUsage,
        });
      }

      // Clear any pending save on success
      const savedProjectId = currentProjectIdRef.current;
      if (savedProjectId) {
        localStorage.removeItem(getPendingSaveKey(savedProjectId));
        setHasPendingSave(false);
      }

      setSaveStatus("saved");
      
      // Reset to idle after 2 seconds
      setTimeout(() => {
        setSaveStatus((current) => current === "saved" ? "idle" : current);
      }, 2000);
    } catch (error) {
      console.error("Auto-save failed:", error);
      setSaveStatus("error");
      
      // Save to localStorage as fallback
      const errorProjectId = currentProjectIdRef.current;
      if (errorProjectId) {
        saveToLocalStorage({
          projectId: errorProjectId,
          htmlContent: data.htmlContent,
          conversationHistory: validatedHistory,
          tokenUsage: data.tokenUsage,
        });
      }
      
      onSaveError?.(error instanceof Error ? error : new Error("Save failed"));
    }
  }, [createMutation, updateMutation, onProjectCreated, onSaveError, saveToLocalStorage]);

  /**
   * Debounced save function
   * Waits 5 seconds before saving to avoid excessive API calls
   */
  const save = useCallback((data: {
    htmlContent: string;
    conversationHistory: ConversationMessage[];
    tokenUsage?: number;
  }) => {
    // Store pending data
    pendingDataRef.current = {
      htmlContent: data.htmlContent,
      conversationHistory: data.conversationHistory,
      tokenUsage: data.tokenUsage ?? 0,
    };

    // Clear existing timeout
    if (debounceTimeoutRef.current) {
      clearTimeout(debounceTimeoutRef.current);
    }

    // Set new timeout
    debounceTimeoutRef.current = setTimeout(() => {
      if (pendingDataRef.current) {
        void performSave(pendingDataRef.current);
        pendingDataRef.current = null;
      }
    }, DEBOUNCE_DELAY_MS);
  }, [performSave]);

  /**
   * Handle generation complete
   * Immediately saves and increments generationCount
   */
  const onGenerationComplete = useCallback(async (data: {
    htmlContent: string;
    conversationHistory: ConversationMessage[];
    tokenUsage: number;
  }) => {
    // Clear any pending debounced save
    if (debounceTimeoutRef.current) {
      clearTimeout(debounceTimeoutRef.current);
      debounceTimeoutRef.current = null;
    }
    pendingDataRef.current = null;

    // Validate conversation history
    const validatedHistory = validateConversationHistory(data.conversationHistory);

    setSaveStatus("saving");

    try {
      // Use ref to check current project ID (avoids stale closure issues)
      const projectIdToUse = currentProjectIdRef.current;
      
      if (!projectIdToUse) {
        // Check if we're already creating a project (prevent race condition)
        if (isCreatingProjectRef.current) {
          console.log("Project creation already in progress, will retry after creation");
          // Wait a bit and retry - the project should be created by then
          await new Promise(resolve => setTimeout(resolve, 1000));
          // Check ref again after wait
          const retryProjectId = currentProjectIdRef.current;
          if (retryProjectId) {
            // Project was created, use it
            await generationCompleteMutation.mutateAsync({
              id: retryProjectId,
              htmlContent: data.htmlContent,
              conversationHistory: validatedHistory,
              tokenUsage: data.tokenUsage,
            });
            return; // Exit early, we're done
          }
          throw new Error("Project creation failed");
        }
        
        // Set flag to prevent duplicate creation
        isCreatingProjectRef.current = true;
        
        try {
          // Create new project first
          const result = await createMutation.mutateAsync({
            title: "Untitled Project",
            htmlContent: data.htmlContent,
            conversationHistory: validatedHistory,
          });
          
          // Update both state and ref immediately
          setCurrentProjectId(result.id);
          currentProjectIdRef.current = result.id;
          onProjectCreated?.(result.id);
          
          // Update URL without full page reload
          window.history.replaceState(null, "", `/editor/${result.id}`);
          
          // Now call generation complete to increment count
          await generationCompleteMutation.mutateAsync({
            id: result.id,
            htmlContent: data.htmlContent,
            conversationHistory: validatedHistory,
            tokenUsage: data.tokenUsage,
          });
        } finally {
          isCreatingProjectRef.current = false;
        }
      } else {
        // Call generation complete mutation
        await generationCompleteMutation.mutateAsync({
          id: projectIdToUse,
          htmlContent: data.htmlContent,
          conversationHistory: validatedHistory,
          tokenUsage: data.tokenUsage,
        });
      }

      // Clear any pending save on success
      if (currentProjectId) {
        localStorage.removeItem(getPendingSaveKey(currentProjectId));
        setHasPendingSave(false);
      }

      setSaveStatus("saved");
      
      // Reset to idle after 2 seconds
      setTimeout(() => {
        setSaveStatus((current) => current === "saved" ? "idle" : current);
      }, 2000);
    } catch (error) {
      console.error("Generation complete save failed:", error);
      setSaveStatus("error");
      
      // Save to localStorage as fallback
      const targetProjectId = currentProjectIdRef.current;
      if (targetProjectId) {
        saveToLocalStorage({
          projectId: targetProjectId,
          htmlContent: data.htmlContent,
          conversationHistory: validatedHistory,
          tokenUsage: data.tokenUsage,
        });
      }
      
      onSaveError?.(error instanceof Error ? error : new Error("Save failed"));
    }
  }, [createMutation, generationCompleteMutation, onProjectCreated, onSaveError, saveToLocalStorage]);

  /**
   * Retry pending save from localStorage
   */
  const retryPendingSave = useCallback(() => {
    if (!currentProjectId) return;
    
    const key = getPendingSaveKey(currentProjectId);
    const pendingSave = safeParsePendingSave(localStorage.getItem(key));
    
    if (pendingSave) {
      void performSave({
        htmlContent: pendingSave.htmlContent,
        conversationHistory: pendingSave.conversationHistory,
        tokenUsage: pendingSave.tokenUsage,
      });
    }
  }, [currentProjectId, performSave]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (debounceTimeoutRef.current) {
        clearTimeout(debounceTimeoutRef.current);
      }
    };
  }, []);

  return {
    saveStatus,
    hasPendingSave,
    save,
    onGenerationComplete,
    retryPendingSave,
    clearPendingSave,
    currentProjectId,
  };
}

export default useAutoSave;
