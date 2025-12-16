/**
 * Smart Edit Engine - Targeted, fast, reliable HTML editing
 * 
 * Uses line-numbered diffs for precise edits.
 * NEVER allows full rewrites - always targeted changes.
 */

export interface EditBlock {
  startLine: number;
  endLine: number;
  newContent: string;
}

export interface ParsedEdit {
  blocks: EditBlock[];
  rawResponse: string;
}

/**
 * Add line numbers to HTML for AI context
 */
export function addLineNumbers(html: string): string {
  const lines = html.split("\n");
  return lines
    .map((line, i) => `${String(i + 1).padStart(4, " ")}| ${line}`)
    .join("\n");
}

/**
 * Parse AI response for edit blocks
 * 
 * Format:
 * ```edit
 * [LINE_START-LINE_END]
 * new content here
 * ```
 * 
 * STRICT: Never accepts full HTML rewrites
 */
export function parseEditResponse(response: string): ParsedEdit {
  const blocks: EditBlock[] = [];

  // Parse edit blocks - multiple formats for robustness
  // Format 1: ```edit\n[START-END]\ncontent```
  const editBlockRegex = /```edit\s*\n\[(\d+)-(\d+)\]\s*\n([\s\S]*?)```/g;

  let match;
  while ((match = editBlockRegex.exec(response)) !== null) {
    const startLine = parseInt(match[1]!, 10);
    const endLine = parseInt(match[2]!, 10);
    const newContent = match[3]!;

    if (startLine > 0 && endLine >= startLine) {
      blocks.push({ startLine, endLine, newContent: newContent.trimEnd() });
    }
  }

  // Format 2: [START-END]\n```\ncontent\n``` (alternative format)
  if (blocks.length === 0) {
    const altRegex = /\[(\d+)-(\d+)\]\s*\n```(?:\w*)\n([\s\S]*?)```/g;
    while ((match = altRegex.exec(response)) !== null) {
      const startLine = parseInt(match[1]!, 10);
      const endLine = parseInt(match[2]!, 10);
      const newContent = match[3]!;

      if (startLine > 0 && endLine >= startLine) {
        blocks.push({ startLine, endLine, newContent: newContent.trimEnd() });
      }
    }
  }

  // Format 3: Lines START-END:\n```\ncontent\n```
  if (blocks.length === 0) {
    const linesRegex = /[Ll]ines?\s*(\d+)[-–](\d+)[:\s]*\n```(?:\w*)\n([\s\S]*?)```/g;
    while ((match = linesRegex.exec(response)) !== null) {
      const startLine = parseInt(match[1]!, 10);
      const endLine = parseInt(match[2]!, 10);
      const newContent = match[3]!;

      if (startLine > 0 && endLine >= startLine) {
        blocks.push({ startLine, endLine, newContent: newContent.trimEnd() });
      }
    }
  }

  // Sort blocks by line number (descending) for safe application
  blocks.sort((a, b) => b.startLine - a.startLine);

  return { blocks, rawResponse: response };
}

/**
 * Apply edit blocks to HTML
 */
export function applyEditBlocks(
  html: string,
  blocks: EditBlock[]
): { success: boolean; html: string; appliedCount: number } {
  if (blocks.length === 0) {
    return { success: false, html, appliedCount: 0 };
  }

  const lines = html.split("\n");
  const totalLines = lines.length;
  let appliedCount = 0;

  // Apply blocks in reverse order (highest line numbers first)
  for (const block of blocks) {
    let { startLine, endLine } = block;
    const { newContent } = block;

    // Clamp line numbers to valid range
    startLine = Math.max(1, Math.min(startLine, totalLines));
    endLine = Math.max(startLine, Math.min(endLine, totalLines));

    // Replace lines (0-indexed)
    const newLines = newContent.split("\n");
    lines.splice(startLine - 1, endLine - startLine + 1, ...newLines);
    appliedCount++;
  }

  return { success: appliedCount > 0, html: lines.join("\n"), appliedCount };
}

/**
 * Build the edit system prompt - STRICT, no full rewrites allowed
 */
export function buildEditSystemPrompt(): string {
  return `You are a precise HTML editor. Your job is to make SMALL, TARGETED changes.

CRITICAL: You must ONLY output edit blocks. NEVER output full HTML.

FORMAT (use exactly this):
\`\`\`edit
[START_LINE-END_LINE]
replacement content
\`\`\`

RULES:
1. ONLY output edit blocks - nothing else
2. Use the exact line numbers shown in the HTML
3. Make the SMALLEST change possible
4. For "change background to blue" - only edit the specific element's class
5. Multiple changes = multiple edit blocks
6. Preserve all existing content not being changed

EXAMPLE - User says "make background blue":
\`\`\`edit
[15-15]
    <body class="bg-blue-500">
\`\`\`

EXAMPLE - User says "change the title":
\`\`\`edit
[23-23]
        <h1 class="text-4xl font-bold">New Title Here</h1>
\`\`\`

EXAMPLE - User says "add a button after the heading":
\`\`\`edit
[23-23]
        <h1 class="text-4xl font-bold">Welcome</h1>
        <button class="mt-4 px-6 py-2 bg-indigo-600 text-white rounded">Click Me</button>
\`\`\`

IMAGE RULES (when adding images):
- Use: <img data-image-query="description" alt="..." class="...">
- For backgrounds: add data-bg-query="description" to the element
- NEVER use URLs like source.unsplash.com

DO NOT:
- Output full HTML documents
- Add explanations or comments
- Make changes the user didn't ask for`;
}

/**
 * Build the user prompt with line-numbered HTML
 */
export function buildEditUserPrompt(html: string, instruction: string): string {
  const numberedHtml = addLineNumbers(html);
  const lineCount = html.split("\n").length;

  return `HTML (${lineCount} lines):
${numberedHtml}

USER REQUEST: ${instruction}

Respond with ONLY edit blocks. Use [LINE-LINE] format.`;
}

/**
 * Analyze edit scope
 */
export function analyzeEditScope(
  instruction: string
): "targeted" | "section" | "global" {
  const lower = instruction.toLowerCase();

  // Global changes
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

  // Section changes
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
 * Extract relevant section from HTML based on keywords
 */
export function extractRelevantSection(
  html: string,
  instruction: string
): {
  section: string;
  startLine: number;
  endLine: number;
  fullHtml: string;
} | null {
  const lower = instruction.toLowerCase();
  const lines = html.split("\n");

  const sectionPatterns: { keywords: string[]; patterns: RegExp[] }[] = [
    {
      keywords: ["header", "navbar", "nav ", "navigation", "menu"],
      patterns: [/<header[\s>]/i, /<nav[\s>]/i, /class="[^"]*nav[^"]*"/i],
    },
    {
      keywords: ["footer"],
      patterns: [/<footer[\s>]/i, /class="[^"]*footer[^"]*"/i],
    },
    {
      keywords: ["hero", "banner", "jumbotron"],
      patterns: [/class="[^"]*hero[^"]*"/i, /class="[^"]*banner[^"]*"/i],
    },
    {
      keywords: ["about"],
      patterns: [/id="about"/i, /class="[^"]*about[^"]*"/i],
    },
    {
      keywords: ["contact"],
      patterns: [/id="contact"/i, /class="[^"]*contact[^"]*"/i, /<form/i],
    },
    {
      keywords: ["pricing"],
      patterns: [/id="pricing"/i, /class="[^"]*pricing[^"]*"/i],
    },
    {
      keywords: ["features"],
      patterns: [/id="features"/i, /class="[^"]*features[^"]*"/i],
    },
    {
      keywords: ["testimonial"],
      patterns: [/id="testimonial/i, /class="[^"]*testimonial[^"]*"/i],
    },
  ];

  for (const { keywords, patterns } of sectionPatterns) {
    if (!keywords.some((k) => lower.includes(k))) continue;

    let startLine = -1;
    let depth = 0;
    let endLine = -1;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]!;

      if (startLine === -1) {
        if (patterns.some((p) => p.test(line))) {
          startLine = i;
          const opens = (line.match(/<(?!\/)[a-z]/gi) || []).length;
          const closes = (line.match(/<\/[a-z]/gi) || []).length;
          depth = opens - closes;
          if (depth <= 0) {
            endLine = i;
            break;
          }
        }
      } else {
        const opens = (line.match(/<(?!\/)[a-z]/gi) || []).length;
        const closes = (line.match(/<\/[a-z]/gi) || []).length;
        depth += opens - closes;

        if (depth <= 0) {
          endLine = i;
          break;
        }
      }
    }

    if (startLine !== -1 && endLine !== -1) {
      const contextStart = Math.max(0, startLine - 2);
      const contextEnd = Math.min(lines.length - 1, endLine + 2);

      return {
        section: lines.slice(contextStart, contextEnd + 1).join("\n"),
        startLine: contextStart + 1,
        endLine: contextEnd + 1,
        fullHtml: html,
      };
    }
  }

  return null;
}
