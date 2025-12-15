/**
 * DeepSeek Service - Conservative targeted fixes using DeepSeek API
 * 
 * IMPORTANT: This service makes MINIMAL, SURGICAL fixes only.
 * It does NOT redesign, remove elements, or make dramatic changes.
 * Each fix must be small and targeted - fixing bugs, not rewriting.
 */

import { parseEditResponse, applyEditBlocks, addLineNumbers } from "~/server/lib/edit-engine";

const DEEPSEEK_API_URL = "https://api.deepseek.com/v1/chat/completions";

import { env } from "~/env";

function getDeepSeekApiKey(): string | undefined {
  return env.DEEPSEEK_API_KEY;
}

export interface PolishResult {
  success: boolean;
  html: string;
  appliedFixes: number;
  failedFixes: number;
  issues: string[];
  duration: number;
}

export interface PolishPhase {
  id: string;
  name: string;
  description: string;
  icon: string;
  prompt: string;
}

/**
 * CONSERVATIVE Polish Phases - Each makes MINIMAL targeted fixes only
 * 
 * RULES FOR ALL PHASES:
 * - NEVER remove images or major elements
 * - NEVER change the design aesthetic or layout
 * - NEVER rewrite large sections of code
 * - Only fix actual bugs and missing attributes
 * - Maximum 3-5 small fixes per phase
 */
export const POLISH_PHASES: PolishPhase[] = [
  {
    id: "broken-resources",
    name: "Resource Audit",
    description: "Fixing broken CDN links only",
    icon: "🔗",
    prompt: `You are a code auditor. Make MINIMAL fixes only.

ONLY FIX:
- Broken CDN URLs (404 errors) - replace with working alternatives
- Malformed Google Fonts links

DO NOT:
- Remove any images
- Change image URLs that use /api/proxy/image (these are correct)
- Remove any elements
- Change the design

If everything looks fine, respond "No changes required."
Maximum 2 fixes allowed.`,
  },
  {
    id: "css-animations",
    name: "Animation Check",
    description: "Adding missing keyframe definitions",
    icon: "✨",
    prompt: `You are a CSS specialist. Make MINIMAL fixes only.

ONLY FIX:
- animate-* classes that reference undefined keyframes (add the missing @keyframes)
- CSS variables used but never declared (add the declaration)

DO NOT:
- Remove any animations
- Change existing animation values
- Modify the design
- Remove any elements

If all animations are properly defined, respond "No changes required."
Maximum 2 fixes allowed.`,
  },
  {
    id: "accessibility",
    name: "Accessibility",
    description: "Adding missing alt text only",
    icon: "♿",
    prompt: `You are an accessibility specialist. Make MINIMAL fixes only.

ONLY FIX:
- Images with empty alt="" - add a brief descriptive alt text
- Buttons with no accessible text - add aria-label

DO NOT:
- Remove any elements
- Change the design or layout
- Modify existing alt text that has content
- Add ARIA roles unless absolutely necessary

If accessibility looks acceptable, respond "No changes required."
Maximum 3 fixes allowed.`,
  },
];

/**
 * Call DeepSeek API for targeted edits
 */
async function callDeepSeek(
  systemPrompt: string,
  userPrompt: string,
  timeout = 30000
): Promise<string> {
  const apiKey = getDeepSeekApiKey();

  if (!apiKey) {
    throw new Error("DEEPSEEK_API_KEY not configured");
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(DEEPSEEK_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "deepseek-chat",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        temperature: 0.1, // Very low for precise, minimal edits
        max_tokens: 2000, // Reduced - we only want small fixes
        stream: false,
      }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`DeepSeek API error: ${response.status} - ${error}`);
    }

    const data = await response.json();
    return data.choices?.[0]?.message?.content || "";
  } catch (error) {
    clearTimeout(timeoutId);
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error("DeepSeek request timed out");
    }
    throw error;
  }
}

/**
 * Run a single polish phase with CONSERVATIVE fixes
 */
export async function runPolishPhase(
  phase: PolishPhase,
  html: string
): Promise<PolishResult> {
  const startTime = Date.now();

  const systemPrompt = `${phase.prompt}

FORMAT FOR CHANGES (use edit blocks with line numbers):
\`\`\`edit
[START_LINE-END_LINE]
replacement content here
\`\`\`

CRITICAL RULES:
- Make the SMALLEST possible change
- NEVER remove images, sections, or major elements
- NEVER change the visual design
- Use exact line numbers from the provided HTML
- If unsure, respond "No changes required."`;

  const numberedHtml = addLineNumbers(html.substring(0, 15000));
  const userPrompt = `Review this HTML and make ONLY essential bug fixes (max 3):

${numberedHtml}${html.length > 15000 ? '\n... (truncated)' : ''}`;

  try {
    const response = await callDeepSeek(systemPrompt, userPrompt);
    const duration = Date.now() - startTime;

    // Check for no changes
    if (response.toLowerCase().includes("no changes required") ||
        response.toLowerCase().includes("no changes needed") ||
        response.toLowerCase().includes("looks fine") ||
        response.toLowerCase().includes("no fixes")) {
      return {
        success: true,
        html,
        appliedFixes: 0,
        failedFixes: 0,
        issues: [],
        duration,
      };
    }

    // Parse and apply blocks using new edit engine
    const parseResult = parseEditResponse(response);

    if (parseResult.fullRewrite) {
      // Don't allow full rewrites in polish phase
      return {
        success: true,
        html,
        appliedFixes: 0,
        failedFixes: 0,
        issues: [],
        duration,
      };
    }

    if (parseResult.blocks.length === 0) {
      return {
        success: true,
        html,
        appliedFixes: 0,
        failedFixes: 0,
        issues: [],
        duration,
      };
    }

    // Limit to max 5 fixes per phase to prevent over-modification
    const limitedBlocks = parseResult.blocks.slice(0, 5);
    const applyResult = applyEditBlocks(html, limitedBlocks);

    return {
      success: true,
      html: applyResult.html,
      appliedFixes: applyResult.appliedCount,
      failedFixes: limitedBlocks.length - applyResult.appliedCount,
      issues: [],
      duration,
    };
  } catch (error) {
    const duration = Date.now() - startTime;
    return {
      success: false,
      html,
      appliedFixes: 0,
      failedFixes: 0,
      issues: [error instanceof Error ? error.message : "Unknown error"],
      duration,
    };
  }
}

/**
 * Run all polish phases sequentially
 */
export async function runFullPolishPipeline(
  html: string,
  onPhaseStart?: (phase: PolishPhase, index: number) => void,
  onPhaseComplete?: (phase: PolishPhase, result: PolishResult, index: number) => void
): Promise<{ finalHtml: string; totalFixes: number; totalDuration: number }> {
  let currentHtml = html;
  let totalFixes = 0;
  let totalDuration = 0;

  for (let i = 0; i < POLISH_PHASES.length; i++) {
    const phase = POLISH_PHASES[i]!;
    onPhaseStart?.(phase, i);

    const result = await runPolishPhase(phase, currentHtml);

    if (result.success && result.appliedFixes > 0) {
      currentHtml = result.html;
      totalFixes += result.appliedFixes;
    }
    totalDuration += result.duration;

    onPhaseComplete?.(phase, result, i);
  }

  return { finalHtml: currentHtml, totalFixes, totalDuration };
}
