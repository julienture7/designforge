/**
 * HTML Processor Module
 * 
 * Processes raw HTML for safe rendering in the sandboxed canvas.
 * Handles Tailwind CDN injection, error handler injection, and script sanitization.
 * 
 * @see Requirements 4.5, 2.6, 9.2
 */

import { env } from "~/env";

/**
 * Whitelist of allowed external script sources.
 * Only scripts from these domains are allowed in the sandbox.
 */
const SCRIPT_WHITELIST = [
  'tailwindcss.com',
  'cdn.tailwindcss.com',
  // Tailwind v4 Play CDN (browser runtime)
  'cdn.jsdelivr.net/npm/@tailwindcss/browser',
  'googleapis.com',
  'fonts.googleapis.com',
  'fontawesome.com',
  'kit.fontawesome.com',
  'cdnjs.cloudflare.com/ajax/libs/font-awesome',
  'phosphoricons.com',
  'unpkg.com/@phosphor-icons',
  // Lucide icons CDN (used by generated pages)
  'unpkg.com/lucide',
];



/**
 * Tailwind CDN script tag to inject into HTML.
 */
const TAILWIND_CDN_SCRIPT = '<script src="https://cdn.tailwindcss.com"></script>';

/**
 * Base href injector script.
 *
 * Why this exists:
 * - HTML rendered via iframe `srcdoc` can have an opaque/`null` origin depending on sandboxing.
 * - Generated HTML frequently uses root-relative URLs like `/api/proxy/image?query=...`.
 * - Without a resolvable base URL, these requests can fail (especially in blob/new-tab previews).
 *
 * Strategy:
 * - If a <base> tag already exists, do nothing.
 * - Prefer deriving the origin from `document.referrer` (works even in opaque-origin sandbox).
 * - Fallback to `window.location.origin` when available.
 */
const BASE_HREF_INJECTOR_SCRIPT = `<script>
  (function () {
    try {
      if (document.querySelector('base')) return;
      var origin = '';
      try {
        if (document.referrer) origin = new URL(document.referrer).origin;
      } catch (e) {}
      try {
        if (!origin && window.location && window.location.origin && window.location.origin !== 'null') {
          origin = window.location.origin;
        }
      } catch (e) {}
      if (!origin) return;
      var base = document.createElement('base');
      base.href = origin.replace(/\\/$/, '') + '/';
      document.head.appendChild(base);
    } catch (e) {}
  })();
</script>`;

/**
 * Image placeholder resolver.
 *
 * Enables a reliable, model-friendly contract for images:
 * - <img data-image-query="luxury dark restaurant interior grain" ...>
 * - <div data-bg-query="abstract neon gradient texture" ...>
 *
 * The model can output stable markup, and we inject real image URLs at runtime.
 * This also means we can increase image count without relying on the model to craft perfect URLs.
 */
const IMAGE_PLACEHOLDER_RESOLVER_SCRIPT = `<script>
  (function () {
    var FALLBACK_QUERIES = [
      'editorial abstract texture grain',
      'cinematic moody lighting interior',
      'minimal product still life studio',
      'architectural concrete brutalism',
      'neon gradient abstract shapes',
      'macro material texture detail'
    ];
    var fallbackIndex = 0;
    function enc(q) {
      try { return encodeURIComponent(String(q || '').trim()); } catch (e) { return ''; }
    }
    function norm(s) {
      try { return String(s || '').trim(); } catch (e) { return ''; }
    }
    function isPlaceholderSrc(src) {
      src = norm(src).toLowerCase();
      return !src || src.indexOf('/images/placeholder.svg') !== -1 || src.indexOf('placeholder.svg') !== -1;
    }
    function deriveQueryFromImg(el) {
      try {
        var q =
          el.getAttribute('data-image-query') ||
          el.getAttribute('data-unsplash-query') ||
          el.getAttribute('data-image') ||
          el.getAttribute('data-query');
        q = norm(q);
        if (q) return q;
        var alt = norm(el.getAttribute('alt'));
        if (alt) return alt;
        // Try nearby heading text (kept short)
        var h = el.closest('section, article, header, main, footer, div');
        if (h) {
          var t = norm(h.textContent || '').replace(/\s+/g, ' ').slice(0, 80);
          if (t) return t;
        }
      } catch (e) {}
      var fb = FALLBACK_QUERIES[fallbackIndex % FALLBACK_QUERIES.length];
      fallbackIndex++;
      return fb;
    }
    function attachFallback(el, q) {
      try {
        if (!el || el.getAttribute('data-image-fallback') === 'true') return;
        el.addEventListener('error', function () {
          try {
            if (el.getAttribute('data-image-fallback') === 'true') return;
            el.setAttribute('data-image-fallback', 'true');
            var fb = FALLBACK_QUERIES[fallbackIndex % FALLBACK_QUERIES.length];
            fallbackIndex++;
            el.setAttribute('src', '/api/proxy/image?query=' + enc(fb));
          } catch (e) {}
        }, { once: true });
        el.addEventListener('load', function () {
          try {
            // Proxy can redirect to placeholder.svg; treat that as a "failed" load and swap once.
            var cur = (el.currentSrc || el.getAttribute('src') || '');
            if (isPlaceholderSrc(cur) && el.getAttribute('data-image-fallback') !== 'true') {
              el.setAttribute('data-image-fallback', 'true');
              var fb = FALLBACK_QUERIES[fallbackIndex % FALLBACK_QUERIES.length];
              fallbackIndex++;
              el.setAttribute('src', '/api/proxy/image?query=' + enc(fb));
            }
          } catch (e) {}
        }, { once: true });
      } catch (e) {}
    }
    function applyImg(el) {
      try {
        var q = deriveQueryFromImg(el);
        if (!q) return;
        if (el.getAttribute('data-image-resolved') === 'true') return;
        var url = '/api/proxy/image?query=' + enc(q);
        // Always resolve placeholder/missing srcs; don't overwrite a real src already present.
        var src = el.getAttribute('src');
        if (isPlaceholderSrc(src)) {
          el.setAttribute('src', url);
        }
        el.setAttribute('loading', el.getAttribute('loading') || 'lazy');
        el.setAttribute('decoding', el.getAttribute('decoding') || 'async');
        el.setAttribute('data-image-resolved', 'true');
        attachFallback(el, q);
      } catch (e) {}
    }
    function applyBg(el) {
      try {
        var q =
          el.getAttribute('data-bg-query') ||
          el.getAttribute('data-background-query') ||
          el.getAttribute('data-bg') ||
          el.getAttribute('data-query');
        q = norm(q);
        if (!q) q = FALLBACK_QUERIES[(fallbackIndex++) % FALLBACK_QUERIES.length];
        if (el.getAttribute('data-bg-resolved') === 'true') return;
        var url = \"url('/api/proxy/image?query=\" + enc(q) + \"')\";
        // Force replace placeholder/empty backgrounds so we never show a missing background.
        if (!el.style.backgroundImage || el.style.backgroundImage === 'none' || el.style.backgroundImage.indexOf('placeholder.svg') !== -1) {
          el.style.backgroundImage = url;
        }
        if (!el.style.backgroundSize) el.style.backgroundSize = 'cover';
        if (!el.style.backgroundPosition) el.style.backgroundPosition = 'center';
        el.setAttribute('data-bg-resolved', 'true');
      } catch (e) {}
    }
    function run() {
      try {
        // Resolve all declared placeholder-query images, plus any raw placeholder.svg <img>.
        var imgs = document.querySelectorAll('img[data-image-query], img[data-unsplash-query], img[data-image], img[src*=\"placeholder.svg\"], img:not([src])');
        for (var i = 0; i < imgs.length; i++) applyImg(imgs[i]);
        var bgs = document.querySelectorAll('[data-bg-query], [data-background-query], [data-bg]');
        for (var j = 0; j < bgs.length; j++) applyBg(bgs[j]);
      } catch (e) {}
    }
    // Run now + keep applying as streaming updates mutate DOM.
    run();
    try {
      new MutationObserver(function () { run(); })
        .observe(document.documentElement, { childList: true, subtree: true, attributes: true });
    } catch (e) {}
    window.addEventListener('load', run);
  })();
</script>`;



/**
 * Error handler script that reports iframe errors to the parent window.
 * Uses postMessage to communicate errors across the sandbox boundary.
 * Also sends IFRAME_READY message when scripts have loaded successfully.
 */
const ERROR_HANDLER_SCRIPT = `<script>
  window.onerror = function(msg, url, line, col, error) {
    window.parent.postMessage({ type: 'IFRAME_ERROR', error: { message: msg, line: line, col: col } }, '*');
    return true;
  };
  
  // Notify parent that scripts have loaded successfully
  window.addEventListener('DOMContentLoaded', function() {
    window.parent.postMessage({ type: 'IFRAME_READY' }, '*');
  });
</script>`;

/**
 * Interface for parsed AESTHETIC_DNA metadata.
 */
export interface AestheticDNA {
  name: string;
  keywords: string[];
  palette: string[];
  typography: string[];
}

/**
 * Regex pattern to match AESTHETIC_DNA comment blocks.
 * Matches HTML comments containing AESTHETIC_DNA: followed by content.
 */
const AESTHETIC_DNA_PATTERN = /<!--\s*AESTHETIC_DNA:([\s\S]*?)-->/;

/**
 * Checks if a script src URL is from a whitelisted domain.
 * 
 * @param src - The script source URL
 * @returns true if the script is from a whitelisted domain
 */
function isWhitelistedScript(src: string): boolean {
  if (!src) return false;
  
  const normalizedSrc = src.toLowerCase();
  return SCRIPT_WHITELIST.some(domain => normalizedSrc.includes(domain.toLowerCase()));
}


/**
 * Sanitizes external script tags by removing non-whitelisted scripts.
 * 
 * @param html - The raw HTML content
 * @returns HTML with non-whitelisted scripts removed
 */
function sanitizeScripts(html: string): string {
  // Match script tags with src attribute
  const scriptPattern = /<script\s+[^>]*src\s*=\s*["']([^"']+)["'][^>]*>[\s\S]*?<\/script>/gi;
  
  return html.replace(scriptPattern, (match, src: string) => {
    if (isWhitelistedScript(src)) {
      return match; // Keep whitelisted scripts
    }
    // Remove non-whitelisted external scripts
    return `<!-- Removed non-whitelisted script: ${src} -->`;
  });
}

/**
 * Processes raw HTML for safe rendering in the sandboxed canvas.
 * 
 * This function:
 * 1. Sanitizes external script tags (whitelist: tailwindcss, googleapis, fontawesome, phosphor)
 * 2. Injects error handler for postMessage error reporting
 * 3. Only injects Tailwind CDN if not already present
 * 
 * @param rawHtml - The raw HTML content from AI generation
 * @returns Processed HTML safe for sandbox rendering
 * 
 * @see Requirements 4.5, 9.2
 */
export function processHtmlForSandbox(rawHtml: string): string {
  if (!rawHtml || typeof rawHtml !== 'string') {
    return '';
  }

  let processedHtml = rawHtml;

  // Sanitize external scripts first
  processedHtml = sanitizeScripts(processedHtml);

  // Check if Tailwind CDN is already included (Gemini usually adds it)
  const hasTailwind = processedHtml.toLowerCase().includes('cdn.tailwindcss.com');
  
  // Only inject error handler (and Tailwind if missing)
  const scriptsToInject = hasTailwind 
    ? `${BASE_HREF_INJECTOR_SCRIPT}\n${IMAGE_PLACEHOLDER_RESOLVER_SCRIPT}\n${ERROR_HANDLER_SCRIPT}\n`
    : `${TAILWIND_CDN_SCRIPT}\n${BASE_HREF_INJECTOR_SCRIPT}\n${IMAGE_PLACEHOLDER_RESOLVER_SCRIPT}\n${ERROR_HANDLER_SCRIPT}\n`;

  // Inject at end of </head> or after <head> or prepend
  const headCloseIndex = processedHtml.toLowerCase().indexOf('</head>');

  if (headCloseIndex !== -1) {
    processedHtml = 
      processedHtml.slice(0, headCloseIndex) + 
      scriptsToInject + 
      processedHtml.slice(headCloseIndex);
  } else {
    const headOpenIndex = processedHtml.toLowerCase().indexOf('<head>');
    
    if (headOpenIndex !== -1) {
      const insertIndex = headOpenIndex + '<head>'.length;
      processedHtml = 
        processedHtml.slice(0, insertIndex) + 
        '\n' + scriptsToInject + 
        processedHtml.slice(insertIndex);
    } else {
      processedHtml = scriptsToInject + processedHtml;
    }
  }

  return processedHtml;
}

/**
 * Extracts AESTHETIC_DNA metadata from HTML content.
 * 
 * Parses the AESTHETIC_DNA comment block that contains design metadata
 * including name, keywords, color palette, and typography information.
 * 
 * @param html - The HTML content containing AESTHETIC_DNA comment
 * @returns Parsed AestheticDNA object or null if not found/invalid
 * 
 * @example
 * extractAestheticDNA(`
 *   <!-- AESTHETIC_DNA:
 *   name: Modern Dark
 *   keywords: dark, modern, sleek
 *   palette: #1a1a1a, #ffffff, #3b82f6
 *   typography: Inter, system-ui
 *   -->
 * `)
 * // Returns: { name: 'Modern Dark', keywords: ['dark', 'modern', 'sleek'], ... }
 * 
 * @see Requirements 2.6
 */
export function extractAestheticDNA(html: string): AestheticDNA | null {
  if (!html || typeof html !== 'string') {
    return null;
  }

  const match = html.match(AESTHETIC_DNA_PATTERN);
  
  if (!match?.[1]) {
    return null;
  }

  const content = match[1].trim();
  
  try {
    const result: AestheticDNA = {
      name: '',
      keywords: [],
      palette: [],
      typography: [],
    };

    // Parse each line of the AESTHETIC_DNA content
    const lines = content.split('\n');
    
    for (const line of lines) {
      const trimmedLine = line.trim();
      if (!trimmedLine) continue;

      // Parse key: value format
      const colonIndex = trimmedLine.indexOf(':');
      if (colonIndex === -1) continue;

      const key = trimmedLine.slice(0, colonIndex).trim().toLowerCase();
      const value = trimmedLine.slice(colonIndex + 1).trim();

      switch (key) {
        case 'name':
          result.name = value;
          break;
        case 'keywords':
          result.keywords = value.split(',').map(k => k.trim()).filter(Boolean);
          break;
        case 'palette':
          result.palette = value.split(',').map(c => c.trim()).filter(Boolean);
          break;
        case 'typography':
          result.typography = value.split(',').map(t => t.trim()).filter(Boolean);
          break;
      }
    }

    // Return null if no valid data was extracted
    if (!result.name && result.keywords.length === 0 && 
        result.palette.length === 0 && result.typography.length === 0) {
      return null;
    }

    return result;
  } catch {
    return null;
  }
}


/**
 * Unsplash API response type for search
 */
interface UnsplashSearchResult {
  results: Array<{
    urls: {
      regular: string;
      small: string;
      thumb: string;
    };
  }>;
}

/**
 * Cache for Unsplash image URLs to avoid duplicate API calls within the same request
 */
const imageCache = new Map<string, string>();

/**
 * Fetch a real image URL from Unsplash API
 */
async function fetchUnsplashImage(query: string): Promise<string | null> {
  // Check in-memory cache first
  const cacheKey = query.toLowerCase().trim();
  if (imageCache.has(cacheKey)) {
    return imageCache.get(cacheKey) ?? null;
  }

  try {
    const url = new URL("https://api.unsplash.com/search/photos");
    url.searchParams.set("query", query);
    url.searchParams.set("per_page", "1");
    url.searchParams.set("orientation", "landscape");

    const response = await fetch(url.toString(), {
      headers: {
        Authorization: `Client-ID ${env.UNSPLASH_ACCESS_KEY}`,
        "Accept-Version": "v1",
        Accept: "application/json",
      },
    });

    if (!response.ok) {
      console.warn(`Unsplash API error for query "${query}": ${response.status}`);
      return null;
    }

    const data = (await response.json()) as UnsplashSearchResult;
    
    if (!data.results || data.results.length === 0) {
      return null;
    }

    const imageUrl = data.results[0]?.urls.regular ?? null;
    
    // Cache the result
    if (imageUrl) {
      imageCache.set(cacheKey, imageUrl);
    }
    
    return imageUrl;
  } catch (error) {
    console.error(`Failed to fetch Unsplash image for "${query}":`, error);
    return null;
  }
}

/**
 * Extract keywords from Unsplash Source URL
 * Handles various formats:
 * - https://source.unsplash.com/1920x1080/?modern,architecture
 * - https://source.unsplash.com/800x400/?design,minimal,glass&sig=8
 * - https://source.unsplash.com/random/800x600/?coffee
 * - https://source.unsplash.com/featured/?keywords
 */
function extractKeywordsFromSourceUrl(url: string): string | null {
  try {
    // First, try to extract everything after the ? and before any &
    const queryMatch = url.match(/source\.unsplash\.com\/[^?]*\?([^&"']+)/i);
    if (queryMatch?.[1]) {
      // Replace commas with spaces for better search, decode URI
      const keywords = decodeURIComponent(queryMatch[1]).replace(/,/g, ' ').trim();
      if (keywords.length > 0) {
        return keywords;
      }
    }
    
    // Fallback: try to extract from path segments (e.g., /featured/nature)
    const pathMatch = url.match(/source\.unsplash\.com\/(?:featured|random|collection\/\d+)\/([^/?&"']+)/i);
    if (pathMatch?.[1]) {
      return decodeURIComponent(pathMatch[1]).replace(/,/g, ' ').trim();
    }
  } catch {
    // Ignore parsing errors
  }
  return null;
}

/**
 * Extract query from various image attributes
 */
function extractImageQuery(imgTag: string): string | null {
  // Check for data-image-query attribute
  const dataQueryMatch = imgTag.match(/data-image-query=["']([^"']+)["']/i);
  if (dataQueryMatch?.[1]) {
    return dataQueryMatch[1];
  }

  // Check for alt text
  const altMatch = imgTag.match(/alt=["']([^"']+)["']/i);
  if (altMatch?.[1] && altMatch[1].length > 3) {
    return altMatch[1];
  }

  // Check for Unsplash Source URL in src
  const srcMatch = imgTag.match(/src=["']([^"']+)["']/i);
  if (srcMatch?.[1] && srcMatch[1].includes('source.unsplash.com')) {
    return extractKeywordsFromSourceUrl(srcMatch[1]);
  }

  return null;
}

/**
 * Extract query from background-image style
 */
function extractBgQuery(element: string): string | null {
  // Check for data-bg-query attribute
  const dataBgMatch = element.match(/data-bg-query=["']([^"']+)["']/i);
  if (dataBgMatch?.[1]) {
    return dataBgMatch[1];
  }

  // Check for Unsplash Source URL in style
  const styleMatch = element.match(/style=["'][^"']*background-image:\s*url\(['"]?([^'")\s]+)['"]?\)/i);
  if (styleMatch?.[1] && styleMatch[1].includes('source.unsplash.com')) {
    return extractKeywordsFromSourceUrl(styleMatch[1]);
  }

  return null;
}

/**
 * Injects real Unsplash image URLs into HTML, replacing:
 * 1. Unsplash Source URLs (source.unsplash.com) which are unreliable
 * 2. Images with data-image-query attributes
 * 3. Background images with data-bg-query attributes
 * 
 * This runs server-side after AI generation to ensure images work reliably.
 */
export async function injectUnsplashImages(html: string): Promise<string> {
  if (!html || typeof html !== 'string') {
    return html;
  }

  // Clear the cache for each new HTML processing
  imageCache.clear();

  let processedHtml = html;

  // PASS 1: Find ALL source.unsplash.com URLs anywhere in the HTML and replace them
  // This is the most aggressive approach - catches URLs in src, style, or anywhere else
  const sourceUrlRegex = /https?:\/\/source\.unsplash\.com\/[^"'\s)]+/gi;
  const sourceUrlMatches = [...html.matchAll(sourceUrlRegex)];
  
  // Process unique URLs to avoid duplicate API calls
  const uniqueSourceUrls = [...new Set(sourceUrlMatches.map(m => m[0]))];
  
  for (const sourceUrl of uniqueSourceUrls) {
    const query = extractKeywordsFromSourceUrl(sourceUrl);
    if (!query) {
      console.warn(`Could not extract keywords from: ${sourceUrl}`);
      continue;
    }
    
    const realUrl = await fetchUnsplashImage(query);
    if (!realUrl) {
      console.warn(`No Unsplash result for query: ${query}`);
      continue;
    }
    
    // Replace ALL occurrences of this source URL with the real URL
    processedHtml = processedHtml.split(sourceUrl).join(realUrl);
  }

  // PASS 2: Handle img tags with data-image-query but no source.unsplash.com URL
  const imgRegex = /<img[^>]+>/gi;
  const imgMatches = [...processedHtml.matchAll(imgRegex)];

  for (const match of imgMatches) {
    const imgTag = match[0];
    const srcMatch = imgTag.match(/src=["']([^"']+)["']/i);
    const currentSrc = srcMatch?.[1] ?? '';

    // Skip if already has a valid working URL (images.unsplash.com is the API result)
    if (currentSrc && 
        currentSrc.includes('images.unsplash.com')) {
      continue;
    }
    
    // Skip if has a valid non-Unsplash URL
    if (currentSrc && 
        !currentSrc.includes('placeholder') &&
        !currentSrc.includes('source.unsplash.com') &&
        currentSrc.startsWith('http')) {
      continue;
    }

    // Extract query from data attributes or alt text
    const query = extractImageQuery(imgTag);
    if (!query) continue;

    // Fetch real image URL
    const realUrl = await fetchUnsplashImage(query);
    if (!realUrl) continue;

    // Replace the src attribute
    let newImgTag = imgTag;
    if (srcMatch) {
      newImgTag = imgTag.replace(srcMatch[0], `src="${realUrl}"`);
    } else {
      // Add src if missing
      newImgTag = imgTag.replace(/<img/, `<img src="${realUrl}"`);
    }

    // Add loading="lazy" if not present
    if (!newImgTag.includes('loading=')) {
      newImgTag = newImgTag.replace(/<img/, '<img loading="lazy"');
    }

    processedHtml = processedHtml.replace(imgTag, newImgTag);
  }

  // PASS 3: Handle elements with data-bg-query attribute that don't have background-image yet
  const dataBgRegex = /<[^>]+data-bg-query=["'][^"']+["'][^>]*>/gi;
  const dataBgMatches = [...processedHtml.matchAll(dataBgRegex)];

  for (const match of dataBgMatches) {
    const element = match[0];
    
    // Check if already has a background-image with a real URL
    if (element.includes('images.unsplash.com')) continue;

    const query = extractBgQuery(element);
    if (!query) continue;

    const realUrl = await fetchUnsplashImage(query);
    if (!realUrl) continue;

    // Add or update background-image style
    let newElement = element;
    if (element.includes('style="')) {
      // Check if there's already a background-image
      if (element.includes('background-image:')) {
        // Replace existing background-image
        newElement = element.replace(/background-image:\s*url\([^)]+\)/i, `background-image: url('${realUrl}')`);
      } else {
        newElement = element.replace(/style="/, `style="background-image: url('${realUrl}'); background-size: cover; background-position: center; `);
      }
    } else if (element.includes("style='")) {
      if (element.includes('background-image:')) {
        newElement = element.replace(/background-image:\s*url\([^)]+\)/i, `background-image: url('${realUrl}')`);
      } else {
        newElement = element.replace(/style='/, `style='background-image: url(${realUrl}); background-size: cover; background-position: center; `);
      }
    } else {
      // Add style attribute
      newElement = element.replace(/>$/, ` style="background-image: url('${realUrl}'); background-size: cover; background-position: center;">`);
    }

    if (newElement !== element) {
      processedHtml = processedHtml.replace(element, newElement);
    }
  }

  console.log(`[injectUnsplashImages] Processed ${uniqueSourceUrls.length} source.unsplash.com URLs`);
  
  return processedHtml;
}
