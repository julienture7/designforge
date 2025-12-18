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
 * This is a FALLBACK script that only handles images NOT already resolved server-side.
 * Server-side injection (injectUnsplashImages) marks resolved images with data-image-resolved="true".
 * This script only processes images that:
 * 1. Have data-image-query but no data-image-resolved attribute
 * 2. Have placeholder.svg as src
 * 3. Have no src at all
 *
 * This prevents redundant processing and improves performance.
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
    var processed = new WeakSet();
    
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
    function isAlreadyResolved(el) {
      // Skip if already resolved by server or previous client run
      return el.getAttribute('data-image-resolved') === 'true' || processed.has(el);
    }
    function deriveQueryFromImg(el) {
      try {
        var q = el.getAttribute('data-image-query') || el.getAttribute('data-unsplash-query') || el.getAttribute('data-image');
        q = norm(q);
        if (q) return q;
        var alt = norm(el.getAttribute('alt'));
        if (alt && alt.length > 3) return alt;
      } catch (e) {}
      var fb = FALLBACK_QUERIES[fallbackIndex % FALLBACK_QUERIES.length];
      fallbackIndex++;
      return fb;
    }
    function applyImg(el) {
      try {
        if (isAlreadyResolved(el)) return;
        var src = el.getAttribute('src') || '';
        // Only process if src is missing, placeholder, or source.unsplash.com
        if (src && !isPlaceholderSrc(src) && src.indexOf('source.unsplash.com') === -1 && src.indexOf('/api/proxy/image') !== -1) return;
        
        var q = deriveQueryFromImg(el);
        if (!q) return;
        
        var url = '/api/proxy/image?query=' + enc(q);
        el.setAttribute('src', url);
        el.setAttribute('loading', el.getAttribute('loading') || 'lazy');
        el.setAttribute('decoding', el.getAttribute('decoding') || 'async');
        el.setAttribute('data-image-resolved', 'true');
        processed.add(el);
      } catch (e) {}
    }
    function applyBg(el) {
      try {
        if (el.getAttribute('data-bg-resolved') === 'true' || processed.has(el)) return;
        var q = el.getAttribute('data-bg-query') || el.getAttribute('data-background-query') || el.getAttribute('data-bg');
        q = norm(q);
        if (!q) return;
        
        var currentBg = el.style.backgroundImage || '';
        // Only apply if no background or placeholder
        if (currentBg && currentBg !== 'none' && currentBg.indexOf('placeholder.svg') === -1 && currentBg.indexOf('/api/proxy/image') !== -1) return;
        
        var url = "url('/api/proxy/image?query=" + enc(q) + "')";
        el.style.backgroundImage = url;
        if (!el.style.backgroundSize) el.style.backgroundSize = 'cover';
        if (!el.style.backgroundPosition) el.style.backgroundPosition = 'center';
        el.setAttribute('data-bg-resolved', 'true');
        processed.add(el);
      } catch (e) {}
    }
    function run() {
      try {
        // Only select unresolved images
        var imgs = document.querySelectorAll('img[data-image-query]:not([data-image-resolved]), img[data-unsplash-query]:not([data-image-resolved]), img[src*="placeholder.svg"]:not([data-image-resolved]), img:not([src]):not([data-image-resolved])');
        for (var i = 0; i < imgs.length; i++) applyImg(imgs[i]);
        var bgs = document.querySelectorAll('[data-bg-query]:not([data-bg-resolved]), [data-background-query]:not([data-bg-resolved])');
        for (var j = 0; j < bgs.length; j++) applyBg(bgs[j]);
      } catch (e) {}
    }
    // Run once on DOMContentLoaded and load - no continuous MutationObserver needed
    // since server-side injection handles the initial HTML
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', run);
    } else {
      run();
    }
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
 * Fetch a real image URL using our proxy API endpoint
 * This uses /api/proxy/image which handles caching, rate limiting, and retries
 * The proxy returns a 302 redirect to the actual Unsplash image URL
 */
async function fetchUnsplashImage(query: string, baseUrl?: string): Promise<string | null> {
  // Check in-memory cache first
  const cacheKey = query.toLowerCase().trim();
  if (imageCache.has(cacheKey)) {
    return imageCache.get(cacheKey) ?? null;
  }

  try {
    // Construct the proxy URL - must be absolute for server-side fetch
    const proxyUrl = baseUrl 
      ? `${baseUrl}/api/proxy/image?query=${encodeURIComponent(query)}`
      : `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/api/proxy/image?query=${encodeURIComponent(query)}`;

    // Fetch from proxy - it will redirect (302) to the actual image URL
    const response = await fetch(proxyUrl, {
      redirect: 'follow', // Automatically follow redirects
      headers: {
        'Accept': 'image/*', // Accept any image type
      },
    });

    // The final URL after following redirects is the actual Unsplash image URL
    const imageUrl = response.url;
    
    // Check if we got a valid image URL (not a placeholder)
    if (imageUrl && 
        !imageUrl.includes('placeholder.svg') && 
        (imageUrl.includes('images.unsplash.com') || imageUrl.includes('unsplash.com'))) {
      // Cache the result
      imageCache.set(cacheKey, imageUrl);
      return imageUrl;
    }
    
    // If we got a placeholder or invalid URL, return null
    console.warn(`Image proxy returned placeholder or invalid URL for query "${query}"`);
    return null;
  } catch (error) {
    console.error(`Failed to fetch image via proxy for "${query}":`, error);
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
 * Extract query from HTML context around an image
 * Looks at nearby headings, text content, and section context
 */
function extractQueryFromContext(html: string, imgIndex: number): string {
  try {
    // Get a chunk of HTML around the image (500 chars before and after)
    const start = Math.max(0, imgIndex - 500);
    const end = Math.min(html.length, imgIndex + 500);
    const context = html.slice(start, end);
    
    // Look for nearby headings (h1-h6)
    const headingMatch = context.match(/<h[1-6][^>]*>([^<]+)<\/h[1-6]>/i);
    if (headingMatch?.[1]) {
      const headingText = headingMatch[1].trim().replace(/\s+/g, ' ').slice(0, 50);
      if (headingText.length > 3) {
        return headingText;
      }
    }
    
    // Look for nearby text content in paragraphs or divs
    const textMatch = context.match(/<p[^>]*>([^<]{20,100})<\/p>/i) || 
                      context.match(/<div[^>]*>([^<]{20,100})<\/div>/i);
    if (textMatch?.[1]) {
      const text = textMatch[1].trim().replace(/\s+/g, ' ').slice(0, 50);
      if (text.length > 10) {
        // Extract key words (remove common words)
        const words = text.split(' ').filter(w => 
          w.length > 3 && 
          !['the', 'and', 'for', 'with', 'this', 'that', 'from'].includes(w.toLowerCase())
        );
        if (words.length >= 2) {
          return words.slice(0, 3).join(' ');
        }
      }
    }
    
    // Look for section IDs or classes that might indicate content
    const sectionMatch = context.match(/(?:id|class)=["']([^"']*(?:hero|about|feature|product|gallery|portfolio|team|testimonial)[^"']*)["']/i);
    if (sectionMatch?.[1]) {
      return sectionMatch[1].split(/[-_\s]+/).filter(w => w.length > 2).slice(0, 3).join(' ');
    }
  } catch {
    // Ignore errors
  }
  
  return '';
}

/**
 * Strips AI-generated image loading scripts that would overwrite our server-injected URLs.
 * The AI sometimes generates JavaScript that loads images from loremflickr, picsum, etc.
 * We need to remove these scripts since we handle image injection server-side.
 */
function stripImageLoadingScripts(html: string): string {
  // Pattern to match script blocks that contain image loading logic
  // These typically iterate over data-image-query or data-bg-query elements
  const scriptPattern = /<script[^>]*>([\s\S]*?)<\/script>/gi;
  
  return html.replace(scriptPattern, (match, scriptContent: string) => {
    // Check if this script contains image loading patterns we want to remove
    const hasImageLoadingPatterns = 
      // Matches loremflickr, picsum, placeholder services
      /loremflickr\.com|picsum\.photos|placeholder\.com|placehold\.co|placekitten\.com/i.test(scriptContent) &&
      // And targets our data attributes
      /data-image-query|data-bg-query|data-unsplash-query/i.test(scriptContent);
    
    // Also check for patterns that overwrite img.src or backgroundImage for our elements
    const hasOverwritePatterns = 
      /querySelectorAll\s*\(\s*['"](?:img|div)\[data-(?:image|bg)-query\]['"]\s*\)[\s\S]*?\.(?:src|backgroundImage)\s*=/i.test(scriptContent);
    
    if (hasImageLoadingPatterns || hasOverwritePatterns) {
      return '<!-- Removed AI-generated image loading script (server handles image injection) -->';
    }
    
    return match;
  });
}

/**
 * Injects real Unsplash image URLs into HTML, replacing:
 * 1. Unsplash Source URLs (source.unsplash.com) which are unreliable
 * 2. Images with data-image-query attributes
 * 3. Background images with data-bg-query attributes
 * 
 * This runs server-side after AI generation to ensure images work reliably.
 * Uses the /api/proxy/image endpoint which handles caching, rate limiting, and retries.
 */
export async function injectUnsplashImages(html: string, baseUrl?: string): Promise<string> {
  if (!html || typeof html !== 'string') {
    return html;
  }

  // Clear the cache for each new HTML processing
  imageCache.clear();

  // First, strip any AI-generated image loading scripts that would overwrite our URLs
  let processedHtml = stripImageLoadingScripts(html);

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
    
    // Always use relative URL - the iframe's <base> tag will resolve it correctly
    const proxyUrl = `/api/proxy/image?query=${encodeURIComponent(query)}`;
    
    // Replace ALL occurrences of this source URL with the proxy URL
    processedHtml = processedHtml.split(sourceUrl).join(proxyUrl);
  }

  // PASS 2: Handle ALL img tags - be more aggressive about finding and fixing images
  const imgRegex = /<img[^>]+>/gi;
  const imgMatches = [...processedHtml.matchAll(imgRegex)];

  for (const match of imgMatches) {
    const imgTag = match[0];
    const srcMatch = imgTag.match(/src=["']([^"']+)["']/i);
    const currentSrc = srcMatch?.[1] ?? '';

    // Skip if already using proxy API
    if (currentSrc && currentSrc.includes('/api/proxy/image')) {
      continue;
    }
    
    // Skip if has a valid non-Unsplash URL (but not placeholders or Unsplash URLs)
    if (currentSrc && 
        !currentSrc.includes('placeholder') &&
        !currentSrc.includes('source.unsplash.com') &&
        !currentSrc.includes('images.unsplash.com') &&
        !currentSrc.includes('unsplash.com') &&
        currentSrc.startsWith('http') &&
        !currentSrc.includes('data:image')) {
      continue;
    }
    
    // Replace ALL Unsplash URLs (source.unsplash.com, images.unsplash.com) with proxy API

    // Extract query from data attributes, alt text, or nearby context
    let query: string | null = extractImageQuery(imgTag);
    
    // If no query found, try to extract from nearby HTML context
    if (!query) {
      const contextQuery = extractQueryFromContext(processedHtml, match.index ?? 0);
      if (contextQuery) {
        query = contextQuery;
      }
    }
    
    // Fallback to generic queries if still no query
    if (!query) {
      const fallbackQueries = [
        'abstract modern design',
        'minimal architecture',
        'editorial photography',
        'contemporary style',
        'professional photography'
      ];
      const matchIndex = imgMatches.indexOf(match);
      const fallbackIndex = matchIndex >= 0 ? matchIndex % fallbackQueries.length : 0;
      query = fallbackQueries[fallbackIndex] || 'modern design';
    }

    // Ensure query is not null at this point
    if (!query) {
      query = 'modern design';
    }

    // Always use relative URL - the iframe's <base> tag will resolve it correctly
    const proxyUrl = `/api/proxy/image?query=${encodeURIComponent(query)}`;

    // Replace the src attribute with proxy URL
    let newImgTag = imgTag;
    if (srcMatch) {
      newImgTag = imgTag.replace(srcMatch[0], `src="${proxyUrl}"`);
    } else {
      // Add src if missing
      newImgTag = imgTag.replace(/<img/, `<img src="${proxyUrl}"`);
    }

    // Add loading="lazy" if not present
    if (!newImgTag.includes('loading=')) {
      newImgTag = newImgTag.replace(/<img/, '<img loading="lazy"');
    }

    // Add error handling attribute for client-side fallback
    if (!newImgTag.includes('data-image-query')) {
      newImgTag = newImgTag.replace(/<img/, `<img data-image-query="${query}"`);
    }

    // Mark as resolved to prevent client-side re-injection
    if (!newImgTag.includes('data-image-resolved')) {
      newImgTag = newImgTag.replace(/<img/, '<img data-image-resolved="true"');
    }

    processedHtml = processedHtml.replace(imgTag, newImgTag);
  }

  // PASS 3: Handle elements with data-bg-query attribute that don't have background-image yet
  const dataBgRegex = /<[^>]+data-bg-query=["'][^"']+["'][^>]*>/gi;
  const dataBgMatches = [...processedHtml.matchAll(dataBgRegex)];

  for (const match of dataBgMatches) {
    const element = match[0];
    
    // Skip if already using proxy API
    if (element.includes('/api/proxy/image')) continue;

    let query: string | null = extractBgQuery(element);
    
    // If no query found, try context extraction
    if (!query) {
      const contextQuery = extractQueryFromContext(processedHtml, match.index ?? 0);
      if (contextQuery) {
        query = contextQuery;
      }
    }
    
    // Fallback query
    if (!query) {
      query = 'abstract modern design';
    }

    // Always use relative URL - the iframe's <base> tag will resolve it correctly
    const proxyUrl = `/api/proxy/image?query=${encodeURIComponent(query)}`;

    // Skip if already resolved (prevent re-injection)
    if (element.includes('data-bg-resolved="true"')) continue;

    // Add or update background-image style with proxy URL
    let newElement = element;
    if (element.includes('style="')) {
      // Check if there's already a background-image
      if (element.includes('background-image:')) {
        // Replace existing background-image (including Unsplash URLs)
        newElement = element.replace(/background-image:\s*url\(['"]?[^'")]+['"]?\)/i, `background-image: url('${proxyUrl}')`);
      } else {
        newElement = element.replace(/style="/, `style="background-image: url('${proxyUrl}'); background-size: cover; background-position: center; `);
      }
    } else if (element.includes("style='")) {
      if (element.includes('background-image:')) {
        newElement = element.replace(/background-image:\s*url\(['"]?[^'")]+['"]?\)/i, `background-image: url('${proxyUrl}')`);
      } else {
        newElement = element.replace(/style='/, `style='background-image: url('${proxyUrl}'); background-size: cover; background-position: center; `);
      }
    } else {
      // Add style attribute
      newElement = element.replace(/>$/, ` style="background-image: url('${proxyUrl}'); background-size: cover; background-position: center;">`);
    }

    // Mark as resolved to prevent client-side re-injection
    if (!newElement.includes('data-bg-resolved')) {
      // Add data-bg-resolved attribute before the closing >
      newElement = newElement.replace(/>$/, ' data-bg-resolved="true">');
    }

    if (newElement !== element) {
      processedHtml = processedHtml.replace(element, newElement);
    }
  }
  
  // PASS 4: Replace ALL remaining Unsplash URLs in background-image styles
  const bgImageRegex = /background-image:\s*url\(['"]?https?:\/\/[^'")]*(?:source|images)\.unsplash\.com[^'")]*['"]?\)/gi;
  const bgImageMatches = [...processedHtml.matchAll(bgImageRegex)];
  
  for (const match of bgImageMatches) {
    const bgImageUrl = match[0];
    // Extract query from the URL if possible
    let query = extractKeywordsFromSourceUrl(bgImageUrl) || 
                extractQueryFromContext(processedHtml, match.index ?? 0) || 
                'abstract modern design';
    
    // Always use relative URL - the iframe's <base> tag will resolve it correctly
    const proxyUrl = `/api/proxy/image?query=${encodeURIComponent(query)}`;
    
    const newBgImage = bgImageUrl.replace(/url\(['"]?[^'")]+['"]?\)/i, `url('${proxyUrl}')`);
    processedHtml = processedHtml.replace(bgImageUrl, newBgImage);
  }

  // PASS 5: Replace any remaining direct Unsplash URLs in img src attributes that weren't caught
  const remainingUnsplashRegex = /src=["']https?:\/\/[^"']*(?:source|images)\.unsplash\.com[^"']*["']/gi;
  const remainingMatches = [...processedHtml.matchAll(remainingUnsplashRegex)];
  
  for (const match of remainingMatches) {
    const srcAttr = match[0];
    const urlMatch = srcAttr.match(/https?:\/\/[^"']*(?:source|images)\.unsplash\.com[^"']*/);
    if (!urlMatch) continue;
    
    const url = urlMatch[0];
    // Extract query from URL or context
    let query = extractKeywordsFromSourceUrl(url) || 
                extractQueryFromContext(processedHtml, match.index ?? 0) || 
                'modern design';
    
    // Always use relative URL - the iframe's <base> tag will resolve it correctly
    const proxyUrl = `/api/proxy/image?query=${encodeURIComponent(query)}`;
    
    const newSrcAttr = srcAttr.replace(/https?:\/\/[^"']*(?:source|images)\.unsplash\.com[^"']*/i, proxyUrl);
    processedHtml = processedHtml.replace(srcAttr, newSrcAttr);
  }

  console.log(`[injectUnsplashImages] Processed ${uniqueSourceUrls.length} source.unsplash.com URLs, ${imgMatches.length} img tags, ${dataBgMatches.length} background elements, replaced all with proxy API URLs`);
  
  return processedHtml;
}
