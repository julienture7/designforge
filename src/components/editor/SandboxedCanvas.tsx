"use client";

import { useEffect, useRef, useState, useCallback } from "react";

interface SandboxedCanvasProps {
  html: string;
  className?: string;
  onRendered?: () => void;
}

/**
 * Inline image resolver that mirrors the server-side injection.
 * Keeping this client-side ensures fragments (or partially streamed HTML)
 * still resolve data-image/data-bg placeholders even before the full
 * document is complete.
 */
const INLINE_IMAGE_RESOLVER = `(function () {
  function enc(q) { try { return encodeURIComponent(String(q || '').trim()); } catch (e) { return ''; } }
  function applyImg(el) {
    try {
      var q = el.getAttribute('data-image-query') || el.getAttribute('data-unsplash-query') || el.getAttribute('data-image');
      if (!q) return;
      if (el.getAttribute('data-image-resolved') === 'true') return;
      var url = '/api/proxy/image?query=' + enc(q);
      el.setAttribute('src', url);
      el.setAttribute('loading', el.getAttribute('loading') || 'lazy');
      el.setAttribute('decoding', el.getAttribute('decoding') || 'async');
      el.setAttribute('data-image-resolved', 'true');
    } catch (e) {}
  }
  function applyBg(el) {
    try {
      var q = el.getAttribute('data-bg-query') || el.getAttribute('data-background-query') || el.getAttribute('data-bg');
      if (!q) return;
      if (el.getAttribute('data-bg-resolved') === 'true') return;
      var url = \"url('/api/proxy/image?query=\" + enc(q) + \"')\";
      if (!el.style.backgroundImage || el.style.backgroundImage === 'none') {
        el.style.backgroundImage = url;
      }
      if (!el.style.backgroundSize) el.style.backgroundSize = 'cover';
      if (!el.style.backgroundPosition) el.style.backgroundPosition = 'center';
      el.setAttribute('data-bg-resolved', 'true');
    } catch (e) {}
  }
  function run() {
    try {
      var imgs = document.querySelectorAll('img[data-image-query], img[data-unsplash-query], img[data-image]');
      for (var i = 0; i < imgs.length; i++) applyImg(imgs[i]);
      var bgs = document.querySelectorAll('[data-bg-query], [data-background-query], [data-bg]');
      for (var j = 0; j < bgs.length; j++) applyBg(bgs[j]);
    } catch (e) {}
  }
  run();
  try {
    new MutationObserver(function () { run(); })
      .observe(document.documentElement, { childList: true, subtree: true, attributes: true });
  } catch (e) {}
  window.addEventListener('load', run);
})();`;

/**
 * Build a safe wrapper head that always has a resolvable base href
 * using the parent's origin, plus Tailwind/Lucide + image resolver.
 */
function buildWrapperHead(): string {
  const origin =
    typeof window !== "undefined" && window.location?.origin && window.location.origin !== "null"
      ? window.location.origin
      : "";

  // Normalize to avoid double slashes in base href
  const baseTag = origin ? `<base href="${origin.replace(/\/$/, "")}/">` : "";

  return `
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  ${baseTag}
  <script src="https://cdn.tailwindcss.com"></script>
  <script src="https://unpkg.com/lucide@latest"></script>
  <script>${INLINE_IMAGE_RESOLVER}</script>
`;
}

function ensureFullHtmlDocument(input: string): string {
  const html = input ?? "";
  const lower = html.toLowerCase();

  const hasHtmlTag = lower.includes("<html");
  const hasHtmlClose = lower.includes("</html>");
  const hasBody = lower.includes("<body");
  const hasBodyClose = lower.includes("</body>");

  // If this is a complete document, just ensure it has a base tag.
  if (hasHtmlTag && hasHtmlClose && hasBody && hasBodyClose) {
    if (lower.includes("<base")) return html;

    // Inject a base tag using the parent origin to make relative URLs (images/API) work inside srcdoc sandbox.
    const headIndex = lower.indexOf("<head");
    if (headIndex !== -1) {
      const headOpenEnd = html.indexOf(">", headIndex);
      if (headOpenEnd !== -1) {
        const baseTag = buildWrapperHead().match(/<base[^>]*>/)?.[0] ?? "";
        if (baseTag) {
          return `${html.slice(0, headOpenEnd + 1)}\n${baseTag}\n${html.slice(headOpenEnd + 1)}`;
        }
      }
    }

    return html;
  }

  // Otherwise wrap the fragment to guarantee a valid document during streaming.
  return `<!DOCTYPE html>
<html>
<head>${buildWrapperHead()}</head>
<body>${html}</body>
</html>`;
}

/**
 * SandboxedCanvas - Full-fidelity live preview.
 *
 * We intentionally update the iframe's `srcDoc` with the *full* processed HTML.
 * This guarantees Tailwind/Fonts/Images behave exactly like the "See Preview" tab.
 */
export function SandboxedCanvas({ html, className = "", onRendered }: SandboxedCanvasProps) {
  // Double-buffered iframe rendering to prevent blinking:
  // - We write updates into the hidden iframe
  // - When it finishes loading, we crossfade swap visibility
  const [srcDocA, setSrcDocA] = useState<string>("");
  const [srcDocB, setSrcDocB] = useState<string>("");
  const [active, setActive] = useState<"a" | "b">("a");
  const activeRef = useRef<"a" | "b">("a");
  const lastHtmlRef = useRef<string>("");
  const loadingTargetRef = useRef<"a" | "b" | null>(null);

  useEffect(() => {
    activeRef.current = active;
  }, [active]);

  const handleLoad = useCallback((loaded: "a" | "b") => {
    // Ignore loads not related to our most recent write.
    if (loadingTargetRef.current !== loaded) return;

    // Swap visible iframe to the one that just loaded.
    setActive(loaded);
    loadingTargetRef.current = null;
    onRendered?.();

  }, [onRendered]);

  useEffect(() => {
    if (!html) {
      setSrcDocA("");
      setSrcDocB("");
      lastHtmlRef.current = "";
      return;
    }

    // Only reload if the HTML actually changed. (Prevents infinite ping-pong swaps.)
    if (html === lastHtmlRef.current) return;
    lastHtmlRef.current = html;

    const nextDoc = ensureFullHtmlDocument(html);

    // Atomically load in the hidden iframe, then swap on load.
    const target: "a" | "b" = activeRef.current === "a" ? "b" : "a";
    loadingTargetRef.current = target;
    if (target === "a") setSrcDocA(nextDoc);
    else setSrcDocB(nextDoc);
  }, [html]);

  // Empty state
  if (!html) {
    return (
      <div className={`h-full w-full flex items-center justify-center bg-white text-gray-400 ${className}`}>
        <div className="text-center">
          <p className="text-lg mb-2">✨</p>
          <p>Ready to design</p>
        </div>
      </div>
    );
  }

  return (
    <div className={`h-full w-full relative overflow-hidden bg-white ${className}`}>
      <iframe
        srcDoc={srcDocA}
        className="absolute inset-0 h-full w-full border-0 transition-opacity duration-150"
        sandbox="allow-scripts allow-same-origin"
        title="Preview A"
        onLoad={() => handleLoad("a")}
        style={{ opacity: active === "a" ? 1 : 0, pointerEvents: active === "a" ? "auto" : "none" }}
      />
      <iframe
        srcDoc={srcDocB}
        className="absolute inset-0 h-full w-full border-0 transition-opacity duration-150"
        sandbox="allow-scripts allow-same-origin"
        title="Preview B"
        onLoad={() => handleLoad("b")}
        style={{ opacity: active === "b" ? 1 : 0, pointerEvents: active === "b" ? "auto" : "none" }}
      />
    </div>
  );
}

export default SandboxedCanvas;
