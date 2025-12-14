"use client";

import { Component, type ReactNode } from "react";
import { RawHtmlViewer } from "./ui/RawHtmlViewer";

interface Props {
  children: ReactNode;
  /** Optional fallback UI to render when an error occurs */
  fallback?: ReactNode;
  /** Optional callback when an error is caught */
  onError?: (error: Error, errorInfo: React.ErrorInfo) => void;
  /** Optional redirect URL for "Go Back" button */
  redirectUrl?: string;
  /** Optional title for the error UI */
  title?: string;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: React.ErrorInfo | null;
  /** Raw HTML content if this is a DOMParser error */
  rawHtml: string | null;
  /** Whether to show the raw HTML viewer modal */
  showRawHtml: boolean;
}

/**
 * ErrorBoundary - General-purpose error boundary component
 * 
 * Catches JavaScript errors in the component tree and displays
 * a fallback UI instead of crashing the entire application.
 * 
 * Features:
 * - Friendly error message with retry button
 * - DOMParser error detection with raw HTML display
 * - Syntax highlighting for raw HTML view
 * - Customizable fallback UI
 * - Error logging
 * 
 * Requirements: 4.8, 8.9
 * DoD: Component crash shows error UI instead of blank page; HTML parsing errors show raw HTML view
 */
export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
      rawHtml: null,
      showRawHtml: false,
    };
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    // Check if this is a DOMParser error
    const isDOMParserError = ErrorBoundary.isDOMParserError(error);
    const rawHtml = isDOMParserError ? ErrorBoundary.extractRawHtml(error) : null;

    return {
      hasError: true,
      error,
      rawHtml,
    };
  }


  /**
   * Check if the error is related to DOMParser/HTML parsing
   */
  static isDOMParserError(error: Error): boolean {
    const message = error.message.toLowerCase();
    const name = error.name.toLowerCase();
    
    return (
      message.includes("domparser") ||
      message.includes("parsing") ||
      message.includes("parse error") ||
      message.includes("invalid html") ||
      message.includes("malformed") ||
      message.includes("syntax error") ||
      name.includes("syntaxerror") ||
      // Check for common HTML parsing error patterns
      message.includes("unexpected token") ||
      message.includes("unterminated") ||
      message.includes("invalid character")
    );
  }

  /**
   * Try to extract raw HTML from the error context
   * This looks for HTML content in error properties or stack trace
   */
  static extractRawHtml(error: Error): string | null {
    // Check if error has a data property with HTML
    const errorWithData = error as Error & { data?: string; html?: string; rawHtml?: string };
    
    if (errorWithData.rawHtml && typeof errorWithData.rawHtml === "string") {
      return errorWithData.rawHtml;
    }
    if (errorWithData.html && typeof errorWithData.html === "string") {
      return errorWithData.html;
    }
    if (errorWithData.data && typeof errorWithData.data === "string") {
      // Check if data looks like HTML
      if (errorWithData.data.includes("<") && errorWithData.data.includes(">")) {
        return errorWithData.data;
      }
    }
    
    return null;
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    // Store error info for display
    this.setState({ errorInfo });

    // Log error for debugging
    console.error("ErrorBoundary caught an error:", {
      error: error.message,
      name: error.name,
      stack: error.stack,
      componentStack: errorInfo.componentStack,
      isDOMParserError: ErrorBoundary.isDOMParserError(error),
      timestamp: new Date().toISOString(),
    });

    // Call optional error callback
    this.props.onError?.(error, errorInfo);
  }

  handleRetry = () => {
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
      rawHtml: null,
      showRawHtml: false,
    });
  };

  handleGoBack = () => {
    const redirectUrl = this.props.redirectUrl ?? "/dashboard";
    window.location.href = redirectUrl;
  };

  handleShowRawHtml = () => {
    this.setState({ showRawHtml: true });
  };

  handleCloseRawHtml = () => {
    this.setState({ showRawHtml: false });
  };

  /**
   * Set raw HTML content externally (e.g., from a parent component)
   * This allows parent components to provide HTML context for DOMParser errors
   */
  setRawHtml = (html: string) => {
    this.setState({ rawHtml: html });
  };

  render() {
    if (this.state.hasError) {
      // Show custom fallback if provided
      if (this.props.fallback) {
        return this.props.fallback;
      }

      const isDOMParserError = this.state.error
        ? ErrorBoundary.isDOMParserError(this.state.error)
        : false;

      return (
        <>
          {/* Raw HTML Viewer Modal */}
          {this.state.showRawHtml && this.state.rawHtml && (
            <RawHtmlViewer
              html={this.state.rawHtml}
              onClose={this.handleCloseRawHtml}
            />
          )}

          {/* Error UI */}
          <div className="min-h-screen bg-background flex items-center justify-center p-4">
            <div className="max-w-md w-full bg-surface border border-border rounded-lg shadow-xl p-6 text-center">
              {/* Error Icon */}
              <div className={`mb-4 ${isDOMParserError ? "text-yellow-500" : "text-destructive"}`}>
                {isDOMParserError ? (
                  <svg
                    className="w-16 h-16 mx-auto"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4"
                    />
                  </svg>
                ) : (
                  <svg
                    className="w-16 h-16 mx-auto"
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
                )}
              </div>

              {/* Error Title */}
              <h2 className="text-xl font-semibold text-foreground mb-2">
                {this.props.title ?? (isDOMParserError ? "HTML Parsing Failed" : "Something went wrong")}
              </h2>

              {/* Error Description */}
              <p className="text-muted mb-6">
                {isDOMParserError
                  ? "The generated HTML could not be parsed. You can view the raw HTML or try again."
                  : "An unexpected error occurred. You can try again or go back to your dashboard."}
              </p>

              {/* Error Details (collapsible) */}
              {this.state.error && (
                <details className="mb-6 text-left">
                  <summary className="text-muted cursor-pointer hover:text-foreground text-sm">
                    Error details
                  </summary>
                  <pre className="mt-2 p-3 bg-background rounded text-xs text-destructive overflow-auto max-h-32">
                    {this.state.error.message}
                  </pre>
                </details>
              )}

              {/* Action Buttons */}
              <div className="flex gap-3 justify-center flex-wrap">
                <button
                  onClick={this.handleRetry}
                  className="px-4 py-2 bg-accent hover:bg-accent/80 text-accent-foreground rounded-lg font-medium transition-colors"
                >
                  Try Again
                </button>
                
                {/* Show "View Raw HTML" button for DOMParser errors */}
                {isDOMParserError && this.state.rawHtml && (
                  <button
                    onClick={this.handleShowRawHtml}
                    className="px-4 py-2 bg-yellow-600 hover:bg-yellow-500 text-white rounded-lg font-medium transition-colors"
                  >
                    View Raw HTML
                  </button>
                )}
                
                <button
                  onClick={this.handleGoBack}
                  className="px-4 py-2 bg-border hover:bg-muted/30 text-foreground rounded-lg font-medium transition-colors"
                >
                  Go to Dashboard
                </button>
              </div>
            </div>
          </div>
        </>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
