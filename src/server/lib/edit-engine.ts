/**
 * Smart Edit Engine - Targeted, fast, reliable HTML editing
 * 
 * Uses line-numbered diffs (like Cursor/Aider) for precise edits.
 * The AI outputs only the changed lines with line numbers.
 */

export interface EditBlock {
  startLine: number;
  endLine: number;
  newContent: string;
}

export interface ParsedEdit {
  blocks: EditBlock[];
  fullRewrite: boolean;
  rawResponse: string;
}

/**
 * Add line numbers to HTML for AI context
 */
export function addLineNumbers(html: string): string {
  const lines = html.split('\n');
  return lines.map((line, i) => `${String(i + 1).padStart(4, ' ')}| ${line}`).join('\n');
}

/**
 * Parse AI response for edit blocks
 * 
 * Format the AI uses:
 * ```edit
 * [LINE_START-LINE_END]
 * new content here
 * can be multiple lines
 * ```
 * 
 * Or for full rewrite:
 * ```html
 * <!DOCTYPE html>...
 * ```
 */
export function parseEditResponse(response: string): ParsedEdit {
  const trimmed = response.trim();
  
  // Check for full HTML rewrite
  const fullHtmlMatch = trimmed.match(/```html\s*\n([\s\S]*?)```/);
  if (fullHtmlMatch?.[1]) {
    const html = fullHtmlMatch[1].trim();
    if (html.startsWith('<!DOCTYPE') || html.startsWith('<html')) {
      return { blocks: [], fullRewrite: true, rawResponse: html };
    }
  }
  
  // Also check if response is just raw HTML (no code blocks)
  if (trimmed.startsWith('<!DOCTYPE') || trimmed.startsWith('<html')) {
    return { blocks: [], fullRewrite: true, rawResponse: trimmed };
  }
  
  // Parse edit blocks
  const blocks: EditBlock[] = [];
  const editBlockRegex = /```edit\s*\n\[(\d+)-(\d+)\]\s*\n([\s\S]*?)```/g;
  
  let match;
  while ((match = editBlockRegex.exec(response)) !== null) {
    const startLine = parseInt(match[1]!, 10);
    const endLine = parseInt(match[2]!, 10);
    const newContent = match[3]!;
    
    if (startLine > 0 && endLine >= startLine) {
      blocks.push({ startLine, endLine, newContent });
    }
  }
  
  // Sort blocks by line number (descending) for safe application
  blocks.sort((a, b) => b.startLine - a.startLine);
  
  return { blocks, fullRewrite: false, rawResponse: response };
}

/**
 * Apply edit blocks to HTML with fuzzy matching fallback
 */
export function applyEditBlocks(html: string, blocks: EditBlock[]): { success: boolean; html: string; appliedCount: number } {
  if (blocks.length === 0) {
    return { success: true, html, appliedCount: 0 };
  }
  
  const lines = html.split('\n');
  const totalLines = lines.length;
  let appliedCount = 0;
  
  // Apply blocks in reverse order (highest line numbers first)
  // This prevents line number shifts from affecting subsequent edits
  for (const block of blocks) {
    let { startLine, endLine } = block;
    const { newContent } = block;
    
    // Clamp line numbers to valid range (AI sometimes gets them slightly wrong)
    startLine = Math.max(1, Math.min(startLine, totalLines));
    endLine = Math.max(startLine, Math.min(endLine, totalLines));
    
    // Replace lines (0-indexed)
    const newLines = newContent.trimEnd().split('\n');
    lines.splice(startLine - 1, endLine - startLine + 1, ...newLines);
    appliedCount++;
  }
  
  return { success: appliedCount > 0, html: lines.join('\n'), appliedCount };
}

/**
 * Alternative: Content-based matching when line numbers fail
 * Finds content by matching the first line of the edit block
 */
export function applyEditBlocksFuzzy(html: string, blocks: EditBlock[], originalHtml: string): { success: boolean; html: string; appliedCount: number } {
  if (blocks.length === 0) {
    return { success: true, html, appliedCount: 0 };
  }
  
  const originalLines = originalHtml.split('\n');
  let currentHtml = html;
  let appliedCount = 0;
  
  for (const block of blocks) {
    const { startLine, endLine, newContent } = block;
    
    // Get the original content that should be replaced
    if (startLine < 1 || endLine > originalLines.length) continue;
    
    const originalContent = originalLines.slice(startLine - 1, endLine).join('\n');
    const trimmedOriginal = originalContent.trim();
    
    if (!trimmedOriginal) continue;
    
    // Try to find this content in current HTML
    const index = currentHtml.indexOf(originalContent);
    if (index !== -1) {
      // Exact match found
      currentHtml = currentHtml.slice(0, index) + newContent.trimEnd() + currentHtml.slice(index + originalContent.length);
      appliedCount++;
    } else {
      // Try fuzzy match (ignore leading/trailing whitespace per line)
      const fuzzyOriginal = originalContent.split('\n').map(l => l.trim()).join('\n');
      const currentLines = currentHtml.split('\n');
      
      for (let i = 0; i <= currentLines.length - (endLine - startLine + 1); i++) {
        const slice = currentLines.slice(i, i + (endLine - startLine + 1));
        const fuzzySlice = slice.map(l => l.trim()).join('\n');
        
        if (fuzzySlice === fuzzyOriginal) {
          // Found fuzzy match
          const newLines = newContent.trimEnd().split('\n');
          currentLines.splice(i, endLine - startLine + 1, ...newLines);
          currentHtml = currentLines.join('\n');
          appliedCount++;
          break;
        }
      }
    }
  }
  
  return { success: appliedCount > 0, html: currentHtml, appliedCount };
}

/**
 * Build the edit system prompt
 */
export function buildEditSystemPrompt(): string {
  return `You are a precise HTML editor. Make ONLY the requested changes.

OUTPUT FORMAT - Use edit blocks with line numbers:
\`\`\`edit
[START_LINE-END_LINE]
replacement content here
\`\`\`

RULES:
1. Output ONLY edit blocks - no explanations before or after
2. Use exact line numbers from the provided HTML
3. Include complete replacement content (not partial lines)
4. For multiple changes, use multiple edit blocks
5. Keep changes minimal - only modify what's necessary
6. Preserve indentation and formatting

EXAMPLE - Change button color on lines 45-47:
\`\`\`edit
[45-47]
        <button class="bg-blue-500 hover:bg-blue-600 text-white px-6 py-3 rounded-lg">
          Click Me
        </button>
\`\`\`

EXAMPLE - Add new section after line 100:
\`\`\`edit
[100-100]
      </section>
      
      <section class="py-16 bg-gray-50">
        <h2 class="text-3xl font-bold">New Section</h2>
      </section>
\`\`\`

IMAGE RULES:
- New images: <img data-image-query="description" alt="..." class="...">
- New backgrounds: <div data-bg-query="description" class="bg-cover">
- NEVER use hardcoded image URLs

For MAJOR redesigns only, output full HTML in \`\`\`html block.`;
}

/**
 * Build the user prompt with line-numbered HTML
 */
export function buildEditUserPrompt(html: string, instruction: string): string {
  const numberedHtml = addLineNumbers(html);
  const lineCount = html.split('\n').length;
  
  return `HTML (${lineCount} lines):
${numberedHtml}

EDIT REQUEST: ${instruction}

Output edit blocks with [LINE-LINE] format. Be precise.`;
}

/**
 * Analyze edit scope to determine if we need full context or can chunk
 */
export function analyzeEditScope(instruction: string): 'targeted' | 'section' | 'global' {
  const lower = instruction.toLowerCase();
  
  // Global changes - affect entire document
  const globalKeywords = [
    'all ', 'every ', 'entire ', 'whole ', 'throughout',
    'font', 'color scheme', 'theme', 'dark mode', 'light mode',
    'responsive', 'mobile', 'spacing everywhere'
  ];
  if (globalKeywords.some(k => lower.includes(k))) {
    return 'global';
  }
  
  // Section changes - affect a specific section
  const sectionKeywords = [
    'header', 'footer', 'navbar', 'nav ', 'hero', 'about',
    'contact', 'pricing', 'features', 'testimonials', 'section',
    'sidebar', 'menu', 'banner'
  ];
  if (sectionKeywords.some(k => lower.includes(k))) {
    return 'section';
  }
  
  // Targeted changes - specific elements
  return 'targeted';
}

/**
 * Extract relevant section from HTML based on keywords
 */
export function extractRelevantSection(html: string, instruction: string): { 
  section: string; 
  startLine: number; 
  endLine: number;
  fullHtml: string;
} | null {
  const lower = instruction.toLowerCase();
  const lines = html.split('\n');
  
  // Define section patterns
  const sectionPatterns: { keywords: string[]; patterns: RegExp[] }[] = [
    {
      keywords: ['header', 'navbar', 'nav ', 'navigation', 'menu'],
      patterns: [/<header[\s>]/i, /<nav[\s>]/i, /class="[^"]*nav[^"]*"/i]
    },
    {
      keywords: ['footer'],
      patterns: [/<footer[\s>]/i, /class="[^"]*footer[^"]*"/i]
    },
    {
      keywords: ['hero', 'banner', 'jumbotron'],
      patterns: [/class="[^"]*hero[^"]*"/i, /class="[^"]*banner[^"]*"/i]
    },
    {
      keywords: ['about'],
      patterns: [/id="about"/i, /class="[^"]*about[^"]*"/i]
    },
    {
      keywords: ['contact'],
      patterns: [/id="contact"/i, /class="[^"]*contact[^"]*"/i, /<form/i]
    },
    {
      keywords: ['pricing'],
      patterns: [/id="pricing"/i, /class="[^"]*pricing[^"]*"/i]
    },
    {
      keywords: ['features'],
      patterns: [/id="features"/i, /class="[^"]*features[^"]*"/i]
    },
    {
      keywords: ['testimonial'],
      patterns: [/id="testimonial/i, /class="[^"]*testimonial[^"]*"/i]
    }
  ];
  
  // Find matching section
  for (const { keywords, patterns } of sectionPatterns) {
    if (!keywords.some(k => lower.includes(k))) continue;
    
    // Find section start
    let startLine = -1;
    let depth = 0;
    let endLine = -1;
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]!;
      
      if (startLine === -1) {
        // Look for section start
        if (patterns.some(p => p.test(line))) {
          startLine = i;
          depth = 1;
          // Count opening tags on this line
          const opens = (line.match(/<(?!\/)[a-z]/gi) || []).length;
          const closes = (line.match(/<\/[a-z]/gi) || []).length;
          depth = opens - closes;
          if (depth <= 0) {
            endLine = i;
            break;
          }
        }
      } else {
        // Track depth to find section end
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
      // Add some context lines
      const contextStart = Math.max(0, startLine - 2);
      const contextEnd = Math.min(lines.length - 1, endLine + 2);
      
      return {
        section: lines.slice(contextStart, contextEnd + 1).join('\n'),
        startLine: contextStart + 1, // 1-indexed
        endLine: contextEnd + 1,
        fullHtml: html
      };
    }
  }
  
  return null;
}
