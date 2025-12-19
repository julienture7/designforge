"use client";

import { useEffect, useRef, memo } from "react";

interface StreamingCodeViewProps {
  /** The HTML code being streamed */
  code: string;
  /** Whether streaming is in progress */
  isStreaming: boolean;
  /** Optional className for the container */
  className?: string;
}

/**
 * StreamingCodeView - Displays streaming HTML code with smooth auto-scroll
 * 
 * Features:
 * - Syntax highlighting for HTML
 * - Smooth auto-scroll animation during streaming
 * - Typing cursor effect at the end
 * - Stops auto-scroll when user manually scrolls up
 */
export const StreamingCodeView = memo(function StreamingCodeView({
  code,
  isStreaming,
  className = "",
}: StreamingCodeViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const codeRef = useRef<HTMLPreElement>(null);
  const isUserScrollingRef = useRef(false);
  const lastScrollTopRef = useRef(0);
  const autoScrollEnabledRef = useRef(true);

  // Handle user scroll detection
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleScroll = () => {
      const { scrollTop, scrollHeight, clientHeight } = container;
      const isAtBottom = scrollHeight - scrollTop - clientHeight < 50;
      
      // If user scrolled up, disable auto-scroll
      if (scrollTop < lastScrollTopRef.current && !isAtBottom) {
        autoScrollEnabledRef.current = false;
        isUserScrollingRef.current = true;
      }
      
      // If user scrolled to bottom, re-enable auto-scroll
      if (isAtBottom) {
        autoScrollEnabledRef.current = true;
        isUserScrollingRef.current = false;
      }
      
      lastScrollTopRef.current = scrollTop;
    };

    container.addEventListener("scroll", handleScroll, { passive: true });
    return () => container.removeEventListener("scroll", handleScroll);
  }, []);

  // Auto-scroll to bottom when code changes (during streaming)
  useEffect(() => {
    if (!isStreaming || !autoScrollEnabledRef.current) return;
    
    const container = containerRef.current;
    if (!container) return;

    // Smooth scroll to bottom
    requestAnimationFrame(() => {
      container.scrollTo({
        top: container.scrollHeight,
        behavior: "smooth",
      });
    });
  }, [code, isStreaming]);

  // Reset auto-scroll when streaming starts
  useEffect(() => {
    if (isStreaming) {
      autoScrollEnabledRef.current = true;
      isUserScrollingRef.current = false;
    }
  }, [isStreaming]);

  // Simple HTML syntax highlighting
  const highlightedCode = highlightHtml(code);

  return (
    <div
      ref={containerRef}
      className={`relative h-full w-full overflow-auto bg-[#1e1e2e] ${className}`}
    >
      {/* Line numbers gutter */}
      <div className="flex">
        <div className="sticky left-0 flex-shrink-0 select-none bg-[#1e1e2e] pr-4 text-right text-xs leading-6 text-gray-500 border-r border-gray-700/50">
          {code.split("\n").map((_, i) => (
            <div key={i} className="px-3">
              {i + 1}
            </div>
          ))}
        </div>
        
        {/* Code content */}
        <pre
          ref={codeRef}
          className="flex-1 p-4 text-sm leading-6 font-mono text-gray-100 whitespace-pre-wrap break-all"
        >
          <code dangerouslySetInnerHTML={{ __html: highlightedCode }} />
          {/* Typing cursor */}
          {isStreaming && (
            <span className="inline-block w-2 h-5 ml-0.5 bg-blue-400 animate-pulse align-middle" />
          )}
        </pre>
      </div>

      {/* Streaming indicator */}
      {isStreaming && (
        <div className="sticky bottom-0 left-0 right-0 bg-gradient-to-t from-[#1e1e2e] via-[#1e1e2e]/90 to-transparent pt-8 pb-3 px-4">
          <div className="flex items-center gap-2 text-xs text-blue-400">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-blue-400 opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-blue-500" />
            </span>
            <span>Generating code...</span>
            <span className="text-gray-500 ml-auto tabular-nums">
              {code.length.toLocaleString()} chars
            </span>
          </div>
        </div>
      )}
    </div>
  );
});

/**
 * Simple HTML syntax highlighting
 */
function highlightHtml(code: string): string {
  if (!code) return "";
  
  // Escape HTML entities first
  let escaped = code
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  
  // Highlight HTML tags
  escaped = escaped.replace(
    /(&lt;\/?)([\w-]+)/g,
    '$1<span class="text-pink-400">$2</span>'
  );
  
  // Highlight attributes
  escaped = escaped.replace(
    /\s([\w-]+)(=)/g,
    ' <span class="text-yellow-300">$1</span><span class="text-gray-400">$2</span>'
  );
  
  // Highlight attribute values (double quotes)
  escaped = escaped.replace(
    /="([^"]*)"/g,
    '=<span class="text-green-400">"$1"</span>'
  );
  
  // Highlight attribute values (single quotes)
  escaped = escaped.replace(
    /='([^']*)'/g,
    "='<span class=\"text-green-400\">$1</span>'"
  );
  
  // Highlight comments
  escaped = escaped.replace(
    /(&lt;!--[\s\S]*?--&gt;)/g,
    '<span class="text-gray-500 italic">$1</span>'
  );
  
  // Highlight DOCTYPE
  escaped = escaped.replace(
    /(&lt;!DOCTYPE[^&]*&gt;)/gi,
    '<span class="text-purple-400">$1</span>'
  );
  
  return escaped;
}

export default StreamingCodeView;
