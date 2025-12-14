"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import type { WebsiteSection } from "@/lib/schema";

type PartialSection = Partial<WebsiteSection> & { html?: string };

interface LivePreviewProps {
  sections: PartialSection[];
  isStreaming: boolean;
}

const IFRAME_BASE_HTML = `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1.0"/>
<script src="https://cdn.tailwindcss.com"></script>
<script>tailwind.config={theme:{extend:{animation:{'fade-in':'fadeIn 0.6s ease-out'},keyframes:{fadeIn:{'0%':{opacity:'0'},'100%':{opacity:'1'}}}}}}</script>
<script src="https://unpkg.com/lucide@latest"></script>
<style>
html,body{margin:0;padding:0;overflow-x:hidden;background:#fff;min-height:100%}
::-webkit-scrollbar{width:8px}
::-webkit-scrollbar-track{background:transparent}
::-webkit-scrollbar-thumb{background:#cbd5e1;border-radius:4px}
::-webkit-scrollbar-thumb:hover{background:#94a3b8}
@keyframes spin{to{transform:rotate(360deg)}}
</style>
</head>
<body>
<div id="content"></div>
<script>
function notifyHeight(){
  var h=Math.max(document.body.scrollHeight,document.documentElement.scrollHeight,600);
  window.parent.postMessage({type:'preview-height',height:h},'*');
}
window.addEventListener('load',notifyHeight);
new MutationObserver(notifyHeight).observe(document.body,{childList:true,subtree:true,attributes:true});
setInterval(notifyHeight,500);
</script>
</body>
</html>`;

export function LivePreview({ sections, isStreaming }: LivePreviewProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [iframeHeight, setIframeHeight] = useState(600);
  const [isReady, setIsReady] = useState(false);
  const lastContentRef = useRef<string>("");

  // Initialize iframe once
  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe) return;

    const handleLoad = () => {
      setIsReady(true);
    };

    iframe.addEventListener("load", handleLoad);
    return () => iframe.removeEventListener("load", handleLoad);
  }, []);

  // Update content when sections change (without reloading iframe)
  const updateContent = useCallback(() => {
    const iframe = iframeRef.current;
    if (!iframe || !isReady) return;

    const doc = iframe.contentDocument;
    const contentDiv = doc?.getElementById("content");
    if (!contentDiv) return;

    const sectionsHtml = sections
      .map((s) => s.html ?? "")
      .filter(Boolean)
      .join("\n");

    const streamingIndicator = isStreaming
      ? `<div style="padding:48px;text-align:center;color:#9ca3af;">
          <div style="display:inline-block;width:32px;height:32px;border:2px solid #d1d5db;border-top-color:#3b82f6;border-radius:50%;animation:spin 1s linear infinite;"></div>
          <p style="margin-top:16px;font-size:12px;letter-spacing:0.1em;text-transform:uppercase;">Building your design...</p>
        </div>`
      : "";

    const newContent = sectionsHtml + streamingIndicator;
    
    // Only update if content actually changed
    if (newContent !== lastContentRef.current) {
      lastContentRef.current = newContent;
      contentDiv.innerHTML = newContent;

      // Re-initialize Lucide icons
      const win = iframe.contentWindow as any;
      if (win?.lucide) {
        try {
          win.lucide.createIcons();
        } catch (e) {
          // Ignore icon errors
        }
      }
    }
  }, [sections, isStreaming, isReady]);

  // Debounced content update during streaming
  useEffect(() => {
    if (!isReady) return;

    if (isStreaming) {
      // During streaming, update every 100ms to batch changes
      const intervalId = setInterval(updateContent, 100);
      return () => clearInterval(intervalId);
    } else {
      // When not streaming, update immediately
      updateContent();
    }
  }, [isStreaming, isReady, updateContent]);

  // Also update when sections change (for non-streaming updates)
  useEffect(() => {
    if (isReady && !isStreaming) {
      updateContent();
    }
  }, [sections, isReady, isStreaming, updateContent]);

  // Listen for height messages from iframe (capped to prevent infinite growth)
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.data?.type === "preview-height" && typeof event.data.height === "number") {
        // Cap height at 5000px to prevent infinite growth, content will scroll inside
        setIframeHeight(Math.min(Math.max(event.data.height, 600), 5000));
      }
    };
    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, []);

  if (!sections || (sections.length === 0 && !isStreaming)) {
    return (
      <div className="flex h-[600px] items-center justify-center bg-white text-gray-400 animate-fade-in">
        <div className="text-center animate-float">
          <p className="mb-2 text-xl">✨</p>
          <p className="text-sm">Ready to design</p>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full bg-white animate-fade-in">
      <iframe
        ref={iframeRef}
        srcDoc={IFRAME_BASE_HTML}
        className="w-full border-none transition-all duration-300"
        title="Live Preview"
        sandbox="allow-scripts allow-same-origin allow-popups"
        style={{
          height: `${iframeHeight}px`,
          display: "block",
          minHeight: "600px",
        }}
      />
    </div>
  );
}
