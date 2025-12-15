import { streamText } from "ai";
import { createDeepSeek } from "@ai-sdk/deepseek";
import { type NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { auth } from "@clerk/nextjs/server";
import { env } from "~/env";

// Create DeepSeek client with beta endpoint
const deepseek = createDeepSeek({
  apiKey: env.DEEPSEEK_API_KEY,
  baseURL: "https://api.deepseek.com/beta",
});

import { getOrCreateUser } from "~/server/auth";
import {
  parseEditResponse,
  applyEditBlocks,
  buildEditSystemPrompt,
  buildEditUserPrompt,
  analyzeEditScope,
  extractRelevantSection,
} from "~/server/lib/edit-engine";
import {
  acquireGenerationLock,
  releaseGenerationLock,
} from "~/server/lib/redis";
import { checkCredits, decrementCredits } from "~/server/services/credit.service";
import {
  checkRateLimit,
  createRateLimitResponse,
  getClientIp,
} from "~/server/lib/rate-limiter";

interface StreamEvent {
  type: "status" | "error" | "complete" | "edit-applied";
  message?: string;
  code?: string;
  finishReason?: string;
  newHtml?: string;
}

export const maxDuration = 300;
export const dynamic = "force-dynamic";

type ErrorCode =
  | "UNAUTHORIZED"
  | "VALIDATION_ERROR"
  | "EMPTY_PROMPT"
  | "CREDITS_EXHAUSTED"
  | "GENERATION_IN_PROGRESS"
  | "AI_SERVICE_BUSY"
  | "EDIT_FAILED"
  | "INTERNAL_ERROR";

function generateCorrelationId(): string {
  return crypto.randomUUID();
}

function createErrorResponse(code: ErrorCode, message: string, status: number, correlationId: string) {
  return NextResponse.json({ success: false, error: { code, message, correlationId } }, { status });
}

function encodeSSE(event: StreamEvent): string {
  return `data: ${JSON.stringify(event)}\n\n`;
}

const encoder = new TextEncoder();

export async function POST(req: NextRequest) {
  const correlationId = generateCorrelationId();
  let clerkId: string | null = null;
  let dbUserId: string | null = null;
  let lockAcquired = false;

  try {
    const { userId } = await auth();
    const rateLimitResult = await checkRateLimit(req, true);
    if (!rateLimitResult.success) {
      return createRateLimitResponse(rateLimitResult);
    }

    if (!userId) {
      return createErrorResponse("UNAUTHORIZED", "Please sign in to continue", 401, correlationId);
    }
    clerkId = userId;

    const user = await getOrCreateUser();
    if (!user) {
      return createErrorResponse("UNAUTHORIZED", "User not found", 404, correlationId);
    }
    dbUserId = user.id;

    let body: { currentHtml: string; editInstruction: string; projectId?: string };
    try {
      body = await req.json();
    } catch {
      return createErrorResponse("VALIDATION_ERROR", "Invalid JSON body", 400, correlationId);
    }

    const { currentHtml, editInstruction } = body;
    if (!currentHtml || !editInstruction?.trim()) {
      return createErrorResponse("VALIDATION_ERROR", "Missing currentHtml or editInstruction", 400, correlationId);
    }

    const creditCheck = await checkCredits(dbUserId);
    const userTier = creditCheck.tier;
    
    if (userTier === "PRO" && creditCheck.remainingCredits < 1) {
      return createErrorResponse("CREDITS_EXHAUSTED", "Not enough Pro credits.", 402, correlationId);
    }
    if (userTier !== "PRO" && !creditCheck.allowed) {
      return createErrorResponse("CREDITS_EXHAUSTED", "You've used all your free generations today.", 402, correlationId);
    }
    const creditVersion = creditCheck.version;

    lockAcquired = await acquireGenerationLock(clerkId);
    if (!lockAcquired) {
      return createErrorResponse("GENERATION_IN_PROGRESS", "Please wait for your current operation to complete", 409, correlationId);
    }

    // Analyze edit scope
    const scope = analyzeEditScope(editInstruction);
    const isNewDesign = /(?:start\s*over|from\s*scratch|completely\s*new|brand\s*new|new\s*website|new\s*page|replace\s*everything)/i.test(editInstruction);

    // Create SSE stream
    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        try {
          controller.enqueue(encoder.encode(encodeSSE({ type: "status", message: "Analyzing edit..." })));
          
          const startTime = Date.now();
          let systemPrompt: string;
          let userPrompt: string;
          let sectionInfo: { startLine: number; endLine: number } | null = null;

          if (isNewDesign) {
            // Full regeneration
            systemPrompt = buildNewDesignPrompt();
            userPrompt = `Generate a complete HTML page for: ${editInstruction}`;
          } else if (scope === 'section') {
            // Try to extract just the relevant section
            const extracted = extractRelevantSection(currentHtml, editInstruction);
            if (extracted) {
              sectionInfo = { startLine: extracted.startLine, endLine: extracted.endLine };
              systemPrompt = buildEditSystemPrompt();
              userPrompt = buildEditUserPrompt(extracted.section, editInstruction) + 
                `\n\nNOTE: This is lines ${extracted.startLine}-${extracted.endLine} of the full document. Use these line numbers.`;
            } else {
              // Fallback to full document
              systemPrompt = buildEditSystemPrompt();
              userPrompt = buildEditUserPrompt(currentHtml, editInstruction);
            }
          } else {
            // Targeted or global - send full document
            systemPrompt = buildEditSystemPrompt();
            userPrompt = buildEditUserPrompt(currentHtml, editInstruction);
          }

          console.log({
            event: "edit_start",
            correlationId,
            scope,
            isNewDesign,
            sectionExtracted: !!sectionInfo,
            htmlLength: currentHtml.length,
          });

          // Call DeepSeek
          const result = streamText({
            model: deepseek("deepseek-chat"),
            system: systemPrompt,
            messages: [{ role: "user", content: userPrompt }],
            temperature: isNewDesign ? 1.0 : 0.2,
            maxOutputTokens: isNewDesign ? 16000 : 4000,
            abortSignal: AbortSignal.timeout(90000),
          });

          let fullResponse = "";
          for await (const part of result.fullStream) {
            if (part.type === "text-delta") {
              fullResponse += part.text;
            }
          }

          const duration = Date.now() - startTime;

          // Parse and apply edits
          const parsed = parseEditResponse(fullResponse);
          let finalHtml: string;

          if (parsed.fullRewrite || isNewDesign) {
            // Full HTML replacement
            finalHtml = parsed.rawResponse;
            if (!finalHtml.includes('<!DOCTYPE') && !finalHtml.includes('<html')) {
              // Try to extract HTML from response
              const htmlMatch = fullResponse.match(/(<!DOCTYPE[\s\S]*<\/html>)/i);
              finalHtml = htmlMatch?.[1] ?? fullResponse;
            }
          } else if (parsed.blocks.length > 0) {
            // Apply edit blocks
            const applied = applyEditBlocks(currentHtml, parsed.blocks);
            if (!applied.success) {
              controller.enqueue(encoder.encode(encodeSSE({
                type: "error",
                code: "EDIT_FAILED",
                message: "Could not apply edits. Please try rephrasing your request.",
              })));
              return;
            }
            finalHtml = applied.html;
            console.log({ event: "edit_applied", correlationId, blocksApplied: applied.appliedCount });
          } else {
            // No edits found - might be "no changes needed" or parsing failed
            // Return original HTML
            finalHtml = currentHtml;
            console.log({ event: "edit_no_changes", correlationId, response: fullResponse.slice(0, 200) });
          }

          // Inject images if needed
          if (hasNewImageQueries(finalHtml)) {
            const { injectUnsplashImages } = await import("~/server/lib/html-processor");
            const baseUrl = new URL(req.url).origin;
            finalHtml = await injectUnsplashImages(finalHtml, baseUrl);
          }

          console.log({
            event: "edit_complete",
            correlationId,
            durationMs: duration,
            blocksApplied: parsed.blocks.length,
            fullRewrite: parsed.fullRewrite,
          });

          controller.enqueue(encoder.encode(encodeSSE({
            type: "edit-applied",
            newHtml: finalHtml,
            message: `Edit completed in ${Math.round(duration / 1000)}s`,
          })));

          controller.enqueue(encoder.encode(encodeSSE({
            type: "complete",
            finishReason: "stop",
            newHtml: finalHtml,
          })));

        } catch (error) {
          const msg = error instanceof Error ? error.message : String(error);
          console.error({ event: "edit_error", correlationId, error: msg });
          
          controller.enqueue(encoder.encode(encodeSSE({
            type: "error",
            code: msg.includes("429") ? "AI_SERVICE_BUSY" : "INTERNAL_ERROR",
            message: msg.includes("429") ? "AI service is busy. Please try again." : "An error occurred.",
          })));
        } finally {
          // Decrement credits
          if (dbUserId) {
            try {
              if (userTier === "PRO") {
                const { db } = await import("~/server/db");
                await db.user.updateMany({
                  where: { id: dbUserId, version: creditVersion, credits: { gte: 1 } },
                  data: { credits: { decrement: 1 }, version: { increment: 1 } },
                });
              } else {
                await decrementCredits(dbUserId, creditVersion);
              }
            } catch (e) {
              console.error({ event: "credit_decrement_failed", dbUserId, error: e });
            }
          }

          if (clerkId && lockAcquired) {
            await releaseGenerationLock(clerkId);
            lockAcquired = false;
          }
          controller.close();
        }
      },
      cancel() {
        if (clerkId && lockAcquired) {
          releaseGenerationLock(clerkId).catch(console.error);
        }
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "X-Correlation-Id": correlationId,
        "Cache-Control": "no-cache, no-store, must-revalidate",
        Connection: "keep-alive",
      },
    });
  } catch (error) {
    console.error({ event: "edit_fatal_error", correlationId, error });
    return createErrorResponse("INTERNAL_ERROR", `Something went wrong (${correlationId})`, 500, correlationId);
  } finally {
    if (clerkId && lockAcquired) {
      await releaseGenerationLock(clerkId);
    }
  }
}

function hasNewImageQueries(html: string): boolean {
  return /data-image-query=["'][^"']+["'](?![^>]*data-image-resolved)/i.test(html) ||
         /data-bg-query=["'][^"']+["'](?![^>]*data-bg-resolved)/i.test(html);
}

function buildNewDesignPrompt(): string {
  return `You are an Elite Web Design AI. Generate a complete, production-ready HTML page.

OUTPUT: Only valid HTML starting with <!DOCTYPE html>. No markdown, no explanations.

REQUIREMENTS:
- Use Tailwind CSS classes
- Mobile responsive
- Smooth animations
- Semantic HTML
- Use Lucide icons (https://unpkg.com/lucide@latest)

IMAGES (MANDATORY):
- Use data-image-query for images: <img data-image-query="description" alt="..." class="...">
- Use data-bg-query for backgrounds: <div data-bg-query="description" class="bg-cover">
- Include 10-15 images minimum
- NEVER use hardcoded image URLs`;
}
