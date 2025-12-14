"use client";

import { useState } from "react";

interface RawHtmlViewerProps {
  html: string;
  onClose: () => void;
}

/**
 * RawHtmlViewer - Modal component for displaying raw HTML with syntax highlighting
 * 
 * Used when DOMParser errors occur to show the raw HTML content.
 * Provides basic syntax highlighting for HTML tags.
 * 
 * Requirements: 4.8
 */
export function RawHtmlViewer({ html, onClose }: RawHtmlViewerProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(html);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback for older browsers
      const textarea = document.createElement('textarea');
      textarea.value = html;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  // Basic syntax highlighting for HTML
  const highlightHtml = (code: string): string => {
    return code
      // Escape HTML entities first
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      // Highlight tags
      .replace(/(&lt;\/?)([\w-]+)/g, '$1<span class="text-blue-400">$2</span>')
      // Highlight attributes
      .replace(/([\w-]+)(=)/g, '<span class="text-yellow-400">$1</span>$2')
      // Highlight attribute values
      .replace(/(".*?")/g, '<span class="text-green-400">$1</span>')
      // Highlight comments
      .replace(/(&lt;!--[\s\S]*?--&gt;)/g, '<span class="text-gray-500">$1</span>');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 animate-fade-in">
      <div className="bg-surface rounded-lg shadow-xl max-w-4xl w-full mx-4 max-h-[80vh] flex flex-col border border-border animate-fade-in-scale">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-border">
          <div className="flex items-center gap-2">
            <span className="text-yellow-400">⚠</span>
            <h2 className="text-foreground font-semibold">Raw HTML (Parsing Failed)</h2>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleCopy}
              className="px-3 py-1 text-sm bg-border hover:bg-muted/30 text-foreground rounded transition-all duration-200 hover:scale-105 active:scale-95"
            >
              {copied ? '✓ Copied!' : 'Copy'}
            </button>
            <button
              onClick={onClose}
              className="text-muted hover:text-foreground text-xl transition-all duration-200 hover:scale-110 active:scale-95"
              aria-label="Close"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto p-4">
          <pre className="text-sm font-mono bg-background rounded p-4 overflow-x-auto">
            <code 
              className="text-muted-foreground"
              dangerouslySetInnerHTML={{ __html: highlightHtml(html) }}
            />
          </pre>
        </div>
      </div>
    </div>
  );
}

export default RawHtmlViewer;
