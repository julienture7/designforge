/**
 * SaveStatusIndicator Component
 * 
 * Displays the current save status with appropriate styling:
 * - "Saving..." with spinner
 * - "Saved" with checkmark
 * - "Error" with retry option
 * - "Saved locally, syncing..." for offline fallback
 * 
 * Requirements: 4.12, 5.7
 */
"use client";

import type { SaveStatus } from "~/hooks/useAutoSave";

interface SaveStatusIndicatorProps {
  /** Current save status */
  status: SaveStatus;
  /** Whether there's a pending save in localStorage */
  hasPendingSave?: boolean;
  /** Callback to retry pending save */
  onRetry?: () => void;
}

export function SaveStatusIndicator({
  status,
  hasPendingSave,
  onRetry,
}: SaveStatusIndicatorProps) {
  // Show pending save indicator if there's data in localStorage
  if (hasPendingSave && status !== "saving") {
    return (
      <div className="flex items-center gap-2 text-yellow-400 text-sm">
        <svg
          className="w-4 h-4"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
          />
        </svg>
        <span>Saved locally, syncing...</span>
        {onRetry && (
          <button
            onClick={onRetry}
            className="text-yellow-300 hover:text-yellow-100 underline ml-1"
          >
            Retry
          </button>
        )}
      </div>
    );
  }

  switch (status) {
    case "saving":
      return (
        <div className="flex items-center gap-2 text-muted text-sm animate-fade-in">
          <svg
            className="w-4 h-4 animate-spin"
            fill="none"
            viewBox="0 0 24 24"
          >
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
            />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
            />
          </svg>
          <span>Saving...</span>
        </div>
      );

    case "saved":
      return (
        <div className="flex items-center gap-2 text-success text-sm animate-fade-in">
          <svg
            className="w-4 h-4 checkmark-animate"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M5 13l4 4L19 7"
            />
          </svg>
          <span>Saved</span>
        </div>
      );

    case "error":
      return (
        <div className="flex items-center gap-2 text-destructive text-sm animate-fade-in">
          <svg
            className="w-4 h-4"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M6 18L18 6M6 6l12 12"
            />
          </svg>
          <span>Save failed</span>
          {onRetry && (
            <button
              onClick={onRetry}
              className="text-destructive/80 hover:text-destructive underline ml-1 transition-colors duration-200 hover:scale-105 active:scale-95"
            >
              Retry
            </button>
          )}
        </div>
      );

    case "offline":
      return (
        <div className="flex items-center gap-2 text-yellow-400 text-sm animate-fade-in">
          <svg
            className="w-4 h-4 animate-pulse-soft"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M18.364 5.636a9 9 0 010 12.728m0 0l-2.829-2.829m2.829 2.829L21 21M15.536 8.464a5 5 0 010 7.072m0 0l-2.829-2.829m-4.243 2.829a4.978 4.978 0 01-1.414-2.83m-1.414 5.658a9 9 0 01-2.167-9.238m7.824 2.167a1 1 0 111.414 1.414m-1.414-1.414L3 3m8.293 8.293l1.414 1.414"
            />
          </svg>
          <span>Saved locally</span>
          {onRetry && (
            <button
              onClick={onRetry}
              className="text-yellow-300 hover:text-yellow-100 underline ml-1 transition-colors duration-200 hover:scale-105 active:scale-95"
            >
              Sync now
            </button>
          )}
        </div>
      );

    case "idle":
    default:
      return (
        <div className="text-muted text-sm transition-opacity duration-200">
          Auto-save enabled
        </div>
      );
  }
}

export default SaveStatusIndicator;
