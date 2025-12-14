/**
 * Edit Parser - Parses and applies search/replace blocks from Gemini
 * 
 * Format:
 * <<<<<<< SEARCH
 * [exact existing code]
 * =======
 * [new code]
 * >>>>>>> REPLACE
 */

export interface SearchReplaceBlock {
  search: string;
  replace: string;
  index: number;
}

export interface ParseResult {
  blocks: SearchReplaceBlock[];
  noChanges: boolean;
  rawResponse: string;
}

export interface ApplyResult {
  success: boolean;
  newContent: string;
  appliedBlocks: number[];
  failedBlocks: { index: number; reason: string }[];
}

/**
 * Parse search/replace blocks from Gemini response
 */
export function parseSearchReplaceBlocks(response: string): ParseResult {
  const trimmed = response.trim();
  
  // Check for "no changes" response
  if (trimmed.toLowerCase().includes("no changes required") || 
      trimmed.toLowerCase().includes("no changes needed")) {
    return { blocks: [], noChanges: true, rawResponse: response };
  }

  const blocks: SearchReplaceBlock[] = [];
  
  // Regex to match search/replace blocks
  // Handles variations in marker format
  const blockRegex = /<<<<<<<?[\s]*SEARCH[\s]*\n([\s\S]*?)\n={7}[\s]*\n([\s\S]*?)\n>>>>>>?>[\s]*REPLACE/gi;
  
  let match;
  let index = 0;
  
  while ((match = blockRegex.exec(response)) !== null) {
    const search = match[1] ?? "";
    const replace = match[2] ?? "";
    
    blocks.push({
      search,
      replace,
      index: index++,
    });
  }

  return { blocks, noChanges: false, rawResponse: response };
}

/**
 * Normalize whitespace for fuzzy matching
 * Converts tabs to spaces, normalizes line endings, trims trailing whitespace per line
 */
function normalizeWhitespace(text: string): string {
  return text
    .replace(/\r\n/g, "\n")  // Normalize line endings
    .replace(/\t/g, "  ")     // Convert tabs to 2 spaces
    .split("\n")
    .map(line => line.trimEnd())  // Trim trailing whitespace per line
    .join("\n");
}

/**
 * Try to find the search string in content with various normalization strategies
 * Returns the actual matched substring from content (preserving original whitespace)
 */
function findSearchInContent(content: string, search: string): { found: boolean; matchedText: string; startIndex: number } {
  // Strategy 1: Exact match
  const exactIndex = content.indexOf(search);
  if (exactIndex !== -1) {
    return { found: true, matchedText: search, startIndex: exactIndex };
  }

  // Strategy 2: Normalized match
  const normalizedContent = normalizeWhitespace(content);
  const normalizedSearch = normalizeWhitespace(search);
  const normalizedIndex = normalizedContent.indexOf(normalizedSearch);
  
  if (normalizedIndex !== -1) {
    // Find the corresponding position in original content
    // This is approximate - we find by line matching
    const searchLines = normalizedSearch.split("\n");
    const contentLines = content.split("\n");
    
    for (let i = 0; i <= contentLines.length - searchLines.length; i++) {
      const slice = contentLines.slice(i, i + searchLines.length);
      const normalizedSlice = slice.map(l => normalizeWhitespace(l)).join("\n");
      
      if (normalizedSlice === normalizedSearch) {
        const matchedText = slice.join("\n");
        const startIndex = contentLines.slice(0, i).join("\n").length + (i > 0 ? 1 : 0);
        return { found: true, matchedText, startIndex };
      }
    }
  }

  // Strategy 3: Trimmed line-by-line match (more aggressive)
  const searchLinesTrimmed = search.split("\n").map(l => l.trim()).filter(l => l.length > 0);
  const contentLines = content.split("\n");
  
  for (let i = 0; i <= contentLines.length - searchLinesTrimmed.length; i++) {
    let matches = true;
    let matchLength = 0;
    
    for (let j = 0; j < searchLinesTrimmed.length; j++) {
      const contentLine = contentLines[i + j];
      if (!contentLine || contentLine.trim() !== searchLinesTrimmed[j]) {
        matches = false;
        break;
      }
      matchLength++;
    }
    
    if (matches && matchLength === searchLinesTrimmed.length) {
      const slice = contentLines.slice(i, i + searchLinesTrimmed.length);
      const matchedText = slice.join("\n");
      const startIndex = contentLines.slice(0, i).join("\n").length + (i > 0 ? 1 : 0);
      return { found: true, matchedText, startIndex };
    }
  }

  return { found: false, matchedText: "", startIndex: -1 };
}


/**
 * Apply search/replace blocks to content
 * Returns result with success status and details of applied/failed blocks
 */
export function applySearchReplaceBlocks(
  content: string,
  blocks: SearchReplaceBlock[]
): ApplyResult {
  if (blocks.length === 0) {
    return {
      success: true,
      newContent: content,
      appliedBlocks: [],
      failedBlocks: [],
    };
  }

  let currentContent = content;
  const appliedBlocks: number[] = [];
  const failedBlocks: { index: number; reason: string }[] = [];

  for (const block of blocks) {
    const result = findSearchInContent(currentContent, block.search);
    
    if (result.found) {
      // Apply the replacement
      currentContent = 
        currentContent.substring(0, result.startIndex) +
        block.replace +
        currentContent.substring(result.startIndex + result.matchedText.length);
      
      appliedBlocks.push(block.index);
    } else {
      // Record failure with diagnostic info
      const searchPreview = block.search.substring(0, 100).replace(/\n/g, "\\n");
      failedBlocks.push({
        index: block.index,
        reason: `SEARCH not found. Preview: "${searchPreview}..."`,
      });
    }
  }

  return {
    success: failedBlocks.length === 0,
    newContent: currentContent,
    appliedBlocks,
    failedBlocks,
  };
}

/**
 * Build the edit system prompt for Gemini
 */
export function buildEditSystemPrompt(): string {
  return `You are an expert HTML editor specializing in precise, minimal changes.
Your primary goal is to output ONLY search/replace blocks for the requested edits.
NEVER output the full HTML or explanations unless explicitly asked.

Format (exact, no variations):
<<<<<<< SEARCH
[exact existing code snippet to find – copy verbatim, including all whitespace, indentation, and newlines]
=======
[new code snippet to replace with – preserve indentation]
>>>>>>> REPLACE

Rules for maximum reliability:
- Use multiple blocks if needed (one per distinct change).
- Match the SEARCH snippet EXACTLY as it appears in the current HTML, including all spaces, tabs, and line breaks.
- Normalize your thinking: Treat tabs/spaces interchangeably where possible, but output exact matches.
- Keep changes as small and localized as possible.
- Include enough context in SEARCH to uniquely identify the location (2-3 lines before/after the change point).
- If a previous edit attempt failed (e.g., "SEARCH not found"), you will receive the error details. Analyze why (e.g., whitespace mismatch, extra newline) and output corrected blocks that WILL match exactly.

If you cannot make the change safely or no change is needed:
Respond "No changes required."`;
}

/**
 * Build the edit user prompt with current HTML
 */
export function buildEditUserPrompt(currentHtml: string, editInstruction: string): string {
  return `Current HTML (use this exactly for matching):
"""
${currentHtml}
"""

User request: ${editInstruction}`;
}

/**
 * Build the retry prompt when blocks fail to apply
 */
export function buildRetryPrompt(
  currentHtml: string,
  failedBlocks: { index: number; reason: string }[],
  originalInstruction: string
): string {
  const errorList = failedBlocks
    .map(fb => `Block ${fb.index + 1}: ${fb.reason}`)
    .join("\n");

  return `Previous search/replace blocks failed to apply. Errors:
${errorList}

Here is the current HTML again:
"""
${currentHtml}
"""

Original request: ${originalInstruction}

Fix the blocks so the SEARCH snippets match EXACTLY (check whitespace, newlines, indentation).
Output ONLY corrected search/replace blocks.`;
}

/**
 * Detect if a user message is an edit request vs a new generation request
 * 
 * Simple logic: If HTML already exists, treat any follow-up as an edit.
 * The only exception is if the user explicitly asks for a completely new page.
 */
export function isEditRequest(message: string, hasExistingHtml: boolean): boolean {
  if (!hasExistingHtml) {
    return false;
  }

  const lowerMessage = message.toLowerCase();
  
  // Only treat as new generation if user explicitly asks for a fresh start
  const newGenerationKeywords = [
    "start over",
    "start fresh",
    "from scratch",
    "new website",
    "new page",
    "completely new",
    "brand new",
    "forget this",
    "discard this",
  ];
  
  const wantsNewGeneration = newGenerationKeywords.some(keyword => lowerMessage.includes(keyword));
  
  // If existing HTML and not explicitly asking for new generation → it's an edit
  return !wantsNewGeneration;
}
