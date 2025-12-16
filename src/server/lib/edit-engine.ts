/**
 * Smart Edit Engine - Reliable HTML editing using search/replace
 * 
 * Inspired by Serena's approach: uses content-based matching (not line numbers)
 * with regex support for flexible, reliable edits.
 */

export interface EditBlock {
  search: string;
  replace: string;
  useRegex?: boolean;
}

export interface ParsedEdit {
  blocks: EditBlock[];
  rawResponse: string;
}

export interface ApplyResult {
  success: boolean;
  html: string;
  appliedCount: number;
  errors: string[];
}

/**
 * Parse AI response for search/replace blocks
 * 
 * Format:
 * <<<<<<< SEARCH
 * content to find
 * =======
 * replacement content
 * >>>>>>> REPLACE
 */
export function parseEditResponse(response: string): ParsedEdit {
  const blocks: EditBlock[] = [];

  // Primary format: <<<<<<< SEARCH ... ======= ... >>>>>>> REPLACE
  const searchReplaceRegex =
    /<<<<<<<?[\s]*SEARCH[\s]*\n([\s\S]*?)\n={7}[\s]*\n([\s\S]*?)\n>>>>>>?>[\s]*REPLACE/gi;

  let match;
  while ((match = searchReplaceRegex.exec(response)) !== null) {
    const search = match[1] ?? "";
    const replace = match[2] ?? "";

    if (search.trim()) {
      blocks.push({ search, replace });
    }
  }

  // Alternative format: ```search ... ``` ```replace ... ```
  if (blocks.length === 0) {
    const altRegex =
      /```search\s*\n([\s\S]*?)```\s*```replace\s*\n([\s\S]*?)```/gi;
    while ((match = altRegex.exec(response)) !== null) {
      const search = match[1] ?? "";
      const replace = match[2] ?? "";
      if (search.trim()) {
        blocks.push({ search, replace });
      }
    }
  }

  return { blocks, rawResponse: response };
}

/**
 * Normalize whitespace for fuzzy matching
 */
function normalizeWhitespace(text: string): string {
  return text
    .replace(/\r\n/g, "\n")
    .replace(/\t/g, "  ")
    .split("\n")
    .map((line) => line.trimEnd())
    .join("\n");
}

/**
 * Find search string in content with multiple strategies
 */
function findInContent(
  content: string,
  search: string
): { found: boolean; start: number; end: number; matchedText: string } {
  // Strategy 1: Exact match
  const exactIndex = content.indexOf(search);
  if (exactIndex !== -1) {
    return {
      found: true,
      start: exactIndex,
      end: exactIndex + search.length,
      matchedText: search,
    };
  }

  // Strategy 2: Normalized whitespace match
  const normalizedContent = normalizeWhitespace(content);
  const normalizedSearch = normalizeWhitespace(search);
  const normalizedIndex = normalizedContent.indexOf(normalizedSearch);

  if (normalizedIndex !== -1) {
    // Map back to original content position
    const searchLines = normalizedSearch.split("\n");
    const contentLines = content.split("\n");

    for (let i = 0; i <= contentLines.length - searchLines.length; i++) {
      const slice = contentLines.slice(i, i + searchLines.length);
      const normalizedSlice = slice.map((l) => l.trimEnd()).join("\n");

      if (normalizedSlice === normalizedSearch) {
        const matchedText = slice.join("\n");
        let start = 0;
        for (let j = 0; j < i; j++) {
          start += contentLines[j]!.length + 1;
        }
        return {
          found: true,
          start,
          end: start + matchedText.length,
          matchedText,
        };
      }
    }
  }

  // Strategy 3: Trimmed line-by-line match (most aggressive)
  const searchLinesTrimmed = search
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
  const contentLines = content.split("\n");

  if (searchLinesTrimmed.length > 0) {
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
        let start = 0;
        for (let j = 0; j < i; j++) {
          start += contentLines[j]!.length + 1;
        }
        return {
          found: true,
          start,
          end: start + matchedText.length,
          matchedText,
        };
      }
    }
  }

  return { found: false, start: -1, end: -1, matchedText: "" };
}

/**
 * Apply search/replace blocks to HTML
 */
export function applyEditBlocks(
  html: string,
  blocks: EditBlock[]
): ApplyResult {
  if (blocks.length === 0) {
    return { success: false, html, appliedCount: 0, errors: ["No edit blocks found"] };
  }

  let currentHtml = html;
  let appliedCount = 0;
  const errors: string[] = [];

  for (const block of blocks) {
    const { search, replace, useRegex } = block;

    if (useRegex) {
      // Regex mode
      try {
        const regex = new RegExp(search, "gs"); // g=global, s=dotall
        const matches = currentHtml.match(regex);

        if (!matches || matches.length === 0) {
          errors.push(`Regex not found: ${search.slice(0, 50)}...`);
          continue;
        }

        if (matches.length > 1) {
          errors.push(
            `Regex matches ${matches.length} occurrences. Be more specific.`
          );
          continue;
        }

        currentHtml = currentHtml.replace(regex, replace);
        appliedCount++;
      } catch (e) {
        errors.push(`Invalid regex: ${e}`);
      }
    } else {
      // Literal mode with fuzzy matching
      const result = findInContent(currentHtml, search);

      if (!result.found) {
        errors.push(`Content not found: "${search.slice(0, 80)}..."`);
        continue;
      }

      // Check for multiple occurrences
      const secondMatch = currentHtml.indexOf(
        result.matchedText,
        result.end
      );
      if (secondMatch !== -1) {
        // Multiple matches - try to be more specific by checking context
        errors.push(
          `Multiple matches found. Include more context in SEARCH block.`
        );
        continue;
      }

      // Apply replacement
      currentHtml =
        currentHtml.slice(0, result.start) +
        replace +
        currentHtml.slice(result.end);
      appliedCount++;
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
 * Build the edit system prompt - search/replace format
 */
export function buildEditSystemPrompt(): string {
  return `You are a precise HTML editor. Make ONLY the requested changes using search/replace blocks.

FORMAT (use exactly this):
<<<<<<< SEARCH
exact content to find (copy from the HTML)
=======
replacement content
>>>>>>> REPLACE

CRITICAL RULES:
1. Copy the SEARCH content EXACTLY from the HTML (including whitespace)
2. Include 2-3 lines of context to ensure unique match
3. Make the SMALLEST change possible
4. Use multiple blocks for multiple changes
5. NEVER output full HTML - only search/replace blocks

EXAMPLE - Change button color:
<<<<<<< SEARCH
        <button class="bg-gray-500 hover:bg-gray-600 text-white px-6 py-3 rounded-lg">
          Click Me
        </button>
=======
        <button class="bg-blue-500 hover:bg-blue-600 text-white px-6 py-3 rounded-lg">
          Click Me
        </button>
>>>>>>> REPLACE

EXAMPLE - Change heading text:
<<<<<<< SEARCH
      <h1 class="text-4xl font-bold text-gray-900">
        Welcome to Our Site
      </h1>
=======
      <h1 class="text-4xl font-bold text-gray-900">
        Welcome to DesignForge
      </h1>
>>>>>>> REPLACE

EXAMPLE - Add element after existing content:
<<<<<<< SEARCH
        <p class="text-gray-600">Some description text.</p>
      </div>
=======
        <p class="text-gray-600">Some description text.</p>
        <button class="mt-4 bg-indigo-600 text-white px-4 py-2 rounded">New Button</button>
      </div>
>>>>>>> REPLACE

IMAGE RULES (when adding images):
- Use: <img data-image-query="description" alt="..." class="...">
- For backgrounds: add data-bg-query="description" to the element
- NEVER use hardcoded image URLs

If no changes needed, respond: "No changes required."`;
}

/**
 * Build the user prompt with HTML content
 */
export function buildEditUserPrompt(html: string, instruction: string): string {
  // Truncate very long HTML to avoid token limits
  const maxLength = 60000;
  const truncatedHtml =
    html.length > maxLength ? html.slice(0, maxLength) + "\n... (truncated)" : html;

  return `Current HTML:
\`\`\`html
${truncatedHtml}
\`\`\`

USER REQUEST: ${instruction}

Output ONLY search/replace blocks. Copy SEARCH content exactly from the HTML above.`;
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

/**
 * Extract relevant section from HTML (optional optimization)
 */
export function extractRelevantSection(
  html: string,
  instruction: string
): {
  section: string;
  startIndex: number;
  endIndex: number;
} | null {
  const lower = instruction.toLowerCase();
  const sectionPatterns: { keywords: string[]; patterns: RegExp[] }[] = [
    {
      keywords: ["header", "navbar", "nav ", "navigation", "menu"],
      patterns: [/<header[\s\S]*?<\/header>/i, /<nav[\s\S]*?<\/nav>/i],
    },
    {
      keywords: ["footer"],
      patterns: [/<footer[\s\S]*?<\/footer>/i],
    },
    {
      keywords: ["hero", "banner"],
      patterns: [
        /<section[^>]*class="[^"]*hero[^"]*"[\s\S]*?<\/section>/i,
        /<div[^>]*class="[^"]*hero[^"]*"[\s\S]*?<\/div>/i,
      ],
    },
  ];

  for (const { keywords, patterns } of sectionPatterns) {
    if (!keywords.some((k) => lower.includes(k))) continue;

    for (const pattern of patterns) {
      const match = html.match(pattern);
      if (match && match.index !== undefined) {
        return {
          section: match[0],
          startIndex: match.index,
          endIndex: match.index + match[0].length,
        };
      }
    }
  }

  return null;
}
