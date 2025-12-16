/**
 * Smart Edit Engine - Exact implementation based on Serena's ReplaceContentTool
 * 
 * Key features:
 * - Two modes: "literal" (exact match) and "regex" (pattern with wildcards)
 * - DOTALL + MULTILINE regex flags (. matches newlines, ^$ match line boundaries)
 * - Single occurrence validation (error if multiple matches)
 * - Regex wildcards like "beginning.*?end" for flexible matching
 */

export interface ReplaceOperation {
  needle: string;
  replacement: string;
  mode: "literal" | "regex";
  allowMultiple?: boolean;
}

export interface ReplaceResult {
  success: boolean;
  content: string;
  matchCount: number;
  error?: string;
}

/**
 * Replace content in text - exact Serena implementation
 * 
 * @param content - The original content
 * @param needle - String or regex pattern to search for
 * @param replacement - Replacement string (supports $1, $2 backreferences in regex mode)
 * @param mode - "literal" for exact match, "regex" for pattern matching
 * @param allowMultiple - If false, error when multiple matches found
 */
export function replaceContent(
  content: string,
  needle: string,
  replacement: string,
  mode: "literal" | "regex",
  allowMultiple: boolean = false
): ReplaceResult {
  let pattern: RegExp;

  if (mode === "literal") {
    // Escape special regex characters for literal matching
    const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    pattern = new RegExp(escaped, "gs"); // g=global, s=dotAll (. matches newlines)
  } else {
    // Use needle as regex pattern directly
    try {
      pattern = new RegExp(needle, "gms"); // g=global, m=multiline, s=dotAll
    } catch (e) {
      return {
        success: false,
        content,
        matchCount: 0,
        error: `Invalid regex pattern: ${e instanceof Error ? e.message : String(e)}`,
      };
    }
  }

  // Count matches first
  const matches = content.match(pattern);
  const matchCount = matches?.length ?? 0;

  if (matchCount === 0) {
    return {
      success: false,
      content,
      matchCount: 0,
      error: "No matches found for the search pattern.",
    };
  }

  if (!allowMultiple && matchCount > 1) {
    return {
      success: false,
      content,
      matchCount,
      error: `Pattern matches ${matchCount} occurrences. Be more specific or use regex with .*? wildcards.`,
    };
  }

  // Perform replacement
  // Convert $1, $2 backreferences to JavaScript format
  const jsReplacement = replacement.replace(/\$!(\d+)/g, "$$$1");
  const newContent = content.replace(pattern, jsReplacement);

  return {
    success: true,
    content: newContent,
    matchCount,
  };
}

/**
 * Parse AI response for replace operations
 * 
 * Supports multiple formats:
 * 1. SEARCH/REPLACE blocks (like Aider/Cursor)
 * 2. Tool-call style JSON
 */
export interface ParsedOperations {
  operations: ReplaceOperation[];
  rawResponse: string;
}

export function parseEditResponse(response: string): ParsedOperations {
  const operations: ReplaceOperation[] = [];

  // Format 1: <<<<<<< SEARCH ... ======= ... >>>>>>> REPLACE
  const searchReplaceRegex =
    /<<<<<<<?[\s]*SEARCH[\s]*\n([\s\S]*?)\n={7}[\s]*\n([\s\S]*?)\n>>>>>>?>[\s]*REPLACE/gi;

  let match;
  while ((match = searchReplaceRegex.exec(response)) !== null) {
    const needle = match[1] ?? "";
    const replacement = match[2] ?? "";

    if (needle.trim()) {
      operations.push({
        needle,
        replacement,
        mode: "literal", // Default to literal for SEARCH/REPLACE blocks
      });
    }
  }

  // Format 2: REGEX blocks for pattern matching
  // <<<<<<< REGEX ... ======= ... >>>>>>> REPLACE
  const regexReplaceRegex =
    /<<<<<<<?[\s]*REGEX[\s]*\n([\s\S]*?)\n={7}[\s]*\n([\s\S]*?)\n>>>>>>?>[\s]*REPLACE/gi;

  while ((match = regexReplaceRegex.exec(response)) !== null) {
    const needle = match[1] ?? "";
    const replacement = match[2] ?? "";

    if (needle.trim()) {
      operations.push({
        needle,
        replacement,
        mode: "regex",
      });
    }
  }

  return { operations, rawResponse: response };
}

/**
 * Apply multiple replace operations to content
 */
export interface ApplyResult {
  success: boolean;
  html: string;
  appliedCount: number;
  errors: string[];
}

export function applyEditBlocks(
  html: string,
  operations: ReplaceOperation[]
): ApplyResult {
  if (operations.length === 0) {
    return {
      success: false,
      html,
      appliedCount: 0,
      errors: ["No edit operations found"],
    };
  }

  let currentHtml = html;
  let appliedCount = 0;
  const errors: string[] = [];

  for (const op of operations) {
    const result = replaceContent(
      currentHtml,
      op.needle,
      op.replacement,
      op.mode,
      op.allowMultiple ?? false
    );

    if (result.success) {
      currentHtml = result.content;
      appliedCount++;
    } else {
      errors.push(result.error ?? "Unknown error");
    }
  }

  return {
    success: appliedCount > 0,
    html: currentHtml,
    appliedCount,
    errors,
  };
}

/**
 * Build the edit system prompt - Serena-style with regex support
 */
export function buildEditSystemPrompt(): string {
  return `You are a precise HTML editor. Make ONLY the requested changes.

## FORMAT OPTIONS

### Option 1: SEARCH/REPLACE (for exact content)
<<<<<<< SEARCH
exact content to find (copy verbatim from HTML)
=======
replacement content
>>>>>>> REPLACE

### Option 2: REGEX (for flexible matching with wildcards)
<<<<<<< REGEX
pattern.*?with.*?wildcards
=======
replacement content
>>>>>>> REPLACE

## CRITICAL RULES

1. **SEARCH blocks**: Copy content EXACTLY from the HTML (including whitespace)
2. **REGEX blocks**: Use .*? wildcards to match content without specifying exact middle
3. **Include context**: Add 2-3 lines before/after to ensure unique match
4. **Minimal changes**: Only modify what's necessary
5. **Multiple changes**: Use multiple blocks

## EXAMPLES

### Change button color (SEARCH - exact match):
<<<<<<< SEARCH
        <button class="bg-gray-500 hover:bg-gray-600 text-white px-6 py-3 rounded-lg">
          Click Me
        </button>
=======
        <button class="bg-blue-500 hover:bg-blue-600 text-white px-6 py-3 rounded-lg">
          Click Me
        </button>
>>>>>>> REPLACE

### Change heading text (REGEX - flexible):
<<<<<<< REGEX
<h1 class="[^"]*">.*?Welcome.*?</h1>
=======
<h1 class="text-4xl font-bold">Welcome to DesignForge</h1>
>>>>>>> REPLACE

### Add element after existing (SEARCH):
<<<<<<< SEARCH
        <p class="text-gray-600">Description text.</p>
      </div>
=======
        <p class="text-gray-600">Description text.</p>
        <button class="mt-4 bg-indigo-600 text-white px-4 py-2 rounded">New Button</button>
      </div>
>>>>>>> REPLACE

## IMAGE RULES
- New images: <img data-image-query="description" alt="..." class="...">
- Backgrounds: data-bg-query="description"
- NEVER use hardcoded image URLs

If no changes needed: "No changes required."`;
}

/**
 * Build the user prompt with HTML content
 */
export function buildEditUserPrompt(html: string, instruction: string): string {
  const maxLength = 60000;
  const truncatedHtml =
    html.length > maxLength
      ? html.slice(0, maxLength) + "\n... (truncated)"
      : html;

  return `Current HTML:
\`\`\`html
${truncatedHtml}
\`\`\`

USER REQUEST: ${instruction}

Use SEARCH/REPLACE or REGEX blocks. Copy content exactly or use wildcards.`;
}

/**
 * Analyze edit scope
 */
export function analyzeEditScope(
  instruction: string
): "targeted" | "section" | "global" {
  const lower = instruction.toLowerCase();

  const globalKeywords = [
    "all ",
    "every ",
    "entire ",
    "whole ",
    "throughout",
    "color scheme",
    "theme",
    "dark mode",
    "light mode",
  ];
  if (globalKeywords.some((k) => lower.includes(k))) {
    return "global";
  }

  const sectionKeywords = [
    "header",
    "footer",
    "navbar",
    "nav ",
    "hero",
    "about",
    "contact",
    "pricing",
    "features",
    "testimonials",
    "section",
    "sidebar",
    "menu",
    "banner",
  ];
  if (sectionKeywords.some((k) => lower.includes(k))) {
    return "section";
  }

  return "targeted";
}
