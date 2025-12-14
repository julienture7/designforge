"use client";

import { createContext, useContext, useCallback, useState, type ReactNode } from "react";
import { ToastContainer, type ToastData, type ToastType, type ToastAction } from "~/components/ui/Toast";

interface ToastContextValue {
  /** Add a toast notification */
  addToast: (toast: Omit<ToastData, 'id'>) => string;
  /** Dismiss a specific toast */
  dismissToast: (id: string) => void;
  /** Clear all toasts */
  clearAllToasts: () => void;
  /** Convenience method for success toast */
  success: (message: string, details?: string) => string;
  /** Convenience method for error toast */
  error: (message: string, details?: string, action?: ToastAction) => string;
  /** Convenience method for warning toast */
  warning: (message: string, details?: string) => string;
  /** Convenience method for info toast */
  info: (message: string, details?: string) => string;
}

const ToastContext = createContext<ToastContextValue | null>(null);

interface ToastProviderProps {
  children: ReactNode;
}

/**
 * ToastProvider - Global toast notification provider
 * 
 * Provides toast notification functionality throughout the application.
 * Wrap your app with this provider to enable toast notifications.
 * 
 * Requirements: 4.6
 */
export function ToastProvider({ children }: ToastProviderProps) {
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

  // Convenience methods for common toast types
  const success = useCallback((message: string, details?: string) => {
    return addToast({ type: 'success', message, details });
  }, [addToast]);

  const error = useCallback((message: string, details?: string, action?: ToastAction) => {
    return addToast({ type: 'error', message, details, action, duration: 8000 });
  }, [addToast]);

  const warning = useCallback((message: string, details?: string) => {
    return addToast({ type: 'warning', message, details });
  }, [addToast]);

  const info = useCallback((message: string, details?: string) => {
    return addToast({ type: 'info', message, details });
  }, [addToast]);

  const value: ToastContextValue = {
    addToast,
    dismissToast,
    clearAllToasts,
    success,
    error,
    warning,
    info,
  };

  return (
    <ToastContext.Provider value={value}>
      {children}
      <ToastContainer toasts={toasts} onDismiss={dismissToast} />
    </ToastContext.Provider>
  );
}

/**
 * useToastContext - Hook to access toast notifications
 * 
 * @throws Error if used outside of ToastProvider
 * @returns Toast context value with methods to show/dismiss toasts
 */
export function useToastContext() {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error("useToastContext must be used within a ToastProvider");
  }
  return context;
}

export default ToastProvider;
