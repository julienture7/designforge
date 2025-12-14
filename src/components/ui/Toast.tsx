"use client";

import { useState, useEffect, useCallback } from "react";

export type ToastType = 'error' | 'warning' | 'success' | 'info';

export interface ToastAction {
  label: string;
  onClick: () => void;
}

export interface ToastProps {
  id: string;
  type: ToastType;
  message: string;
  details?: string;
  action?: ToastAction;
  duration?: number;
  onDismiss: (id: string) => void;
}

/**
 * Toast - Individual toast notification component
 * 
 * Displays error, warning, success, or info messages with optional action button.
 */
export function Toast({ 
  id, 
  type, 
  message, 
  details, 
  action, 
  duration = 5000, 
  onDismiss 
}: ToastProps) {
  const bgColor = {
    error: "bg-destructive/10 border-destructive/30",
    warning: "bg-yellow-50 border-yellow-200",
    success: "bg-success/10 border-success/30",
    info: "bg-accent/10 border-accent/30",
  }[type];

  const iconColor = {
    error: "text-destructive",
    warning: "text-yellow-700",
    success: "text-success",
    info: "text-accent",
  }[type];

  const [isExiting, setIsExiting] = useState(false);

  const handleDismiss = useCallback(() => {
    setIsExiting(true);
    setTimeout(() => onDismiss(id), 200);
  }, [id, onDismiss]);

  useEffect(() => {
    if (duration > 0) {
      const timer = setTimeout(() => {
        handleDismiss();
      }, duration);
      return () => clearTimeout(timer);
    }
  }, [duration, handleDismiss]);

  return (
    <div 
      className={`${bgColor} border rounded-lg p-4 shadow-lg max-w-md backdrop-blur-sm transition-all duration-200 ${
        isExiting 
          ? 'opacity-0 translate-x-4 scale-95' 
          : 'animate-slide-in hover:shadow-xl hover:-translate-y-0.5'
      }`}
      role="alert"
    >
      <div className="flex items-start gap-3">
        <span className={`${iconColor} text-lg transition-transform duration-200 hover:scale-110`}>
          {type === "error" && "⚠"}
          {type === "warning" && "⚡"}
          {type === "success" && "✓"}
          {type === "info" && "ℹ"}
        </span>
        <div className="flex-1 min-w-0">
          <p className="text-foreground font-medium">{message}</p>
          {details && (
            <p className="text-muted text-sm mt-1 break-words">{details}</p>
          )}
          {action && (
            <button
              onClick={action.onClick}
              className="mt-2 text-sm text-accent hover:text-accent/80 underline transition-colors duration-200"
            >
              {action.label}
            </button>
          )}
        </div>
        <button
          onClick={handleDismiss}
          className="text-muted hover:text-foreground transition-all duration-200 hover:scale-110 active:scale-95"
          aria-label="Dismiss"
        >
          ✕
        </button>
      </div>
    </div>
  );
}


export interface ToastData {
  id: string;
  type: ToastType;
  message: string;
  details?: string;
  action?: ToastAction;
  duration?: number;
}

interface ToastContainerProps {
  toasts: ToastData[];
  onDismiss: (id: string) => void;
}

/**
 * ToastContainer - Container for displaying multiple toast notifications
 * 
 * Renders toasts in a fixed position at the bottom-right of the screen.
 */
export function ToastContainer({ toasts, onDismiss }: ToastContainerProps) {
  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2">
      {toasts.map((toast) => (
        <Toast
          key={toast.id}
          id={toast.id}
          type={toast.type}
          message={toast.message}
          details={toast.details}
          action={toast.action}
          duration={toast.duration}
          onDismiss={onDismiss}
        />
      ))}
    </div>
  );
}

/**
 * useToast - Hook for managing toast notifications
 * 
 * @returns Object with toasts array, addToast function, and dismissToast function
 */
export function useToast() {
  const [toasts, setToasts] = useState<ToastData[]>([]);

  const addToast = useCallback((toast: Omit<ToastData, 'id'>) => {
    const id = `toast-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    setToasts((prev) => [...prev, { ...toast, id }]);
    return id;
  }, []);

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const clearAllToasts = useCallback(() => {
    setToasts([]);
  }, []);

  return {
    toasts,
    addToast,
    dismissToast,
    clearAllToasts,
  };
}

export default Toast;
