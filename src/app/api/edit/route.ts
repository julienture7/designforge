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
  parseSearchReplaceBlocks,
  applySearchReplaceBlocks,
  buildEditSystemPrompt,
  buildEditUserPrompt,
  buildRetryPrompt,
} from "~/server/lib/edit-parser";
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

/**
 * SSE Event types for edit stream
 */
interface StreamEvent {
  type: "status" | "content" | "reasoning" | "error" | "complete" | "edit-applied";
  message?: string;
  code?: string;
  finishReason?: string;
  newHtml?: string;
  appliedBlocks?: number;
  failedBlocks?: number;
}

/**
 * Route config - 5 minute timeout for edit operations
 */
export const maxDuration = 300;
export const dynamic = "force-dynamic";

type ErrorCode =
  | "UNAUTHORIZED"
  | "VALIDATION_ERROR"
  | "EMPTY_PROMPT"
  | "CREDITS_EXHAUSTED"
  | "GENERATION_IN_PROGRESS"
  | "AI_SERVICE_BUSY"
  | "AI_SERVICE_UNAVAILABLE"
  | "EDIT_FAILED"
  | "INTERNAL_ERROR";

function generateCorrelationId(): string {
  return crypto.randomUUID();
}

function createErrorResponse(
  code: ErrorCode,
  message: string,
  status: number,
  correlationId: string
) {
  return NextResponse.json(
    {
      success: false,
      error: { code, message, correlationId },
    },
    { status }
  );
}

function encodeSSEEvent(event: StreamEvent): string {
  return `data: ${JSON.stringify(event)}\n\n`;
}

const textEncoder = new TextEncoder();

/**
 * POST /api/edit
 * 
 * Edit endpoint using search/replace blocks
 * - Uses lower temperature (0.2) for deterministic output
 * - Retries failed blocks up to 2 times with re-prompting
 */
export async function POST(req: NextRequest) {
  const correlationId = generateCorrelationId();
  let clerkId: string | null = null;
  let dbUserId: string | null = null;
  let lockAcquired = false;

  try {
    // Rate limiting
    const { userId } = await auth();
    const rateLimitIdentifier = userId ?? getClientIp(req);
    
    const rateLimitResult = await checkRateLimit(req, true);
    if (!rateLimitResult.success) {
      console.log({
        event: "rate_limit_exceeded",
        identifier: rateLimitIdentifier,
        endpoint: "/api/edit",
        correlationId,
      });
      return createRateLimitResponse(rateLimitResult);
    }

    // Auth check
    if (!userId) {
      return createErrorResponse("UNAUTHORIZED", "Please sign in to continue", 401, correlationId);
    }
    clerkId = userId;

    // Get or create user in database
    const user = await getOrCreateUser();
    if (!user) {
      return createErrorResponse("UNAUTHORIZED", "User not found", 404, correlationId);
    }
    dbUserId = user.id;

    // Parse body
    let body: { currentHtml: string; editInstruction: string; projectId?: string };
    try {
      body = await req.json();
    } catch {
      return createErrorResponse("VALIDATION_ERROR", "Invalid JSON body", 400, correlationId);
    }

    const { currentHtml, editInstruction, projectId } = body;

    if (!currentHtml || !editInstruction) {
      return createErrorResponse("VALIDATION_ERROR", "Missing currentHtml or editInstruction", 400, correlationId);
    }

    if (!editInstruction.trim()) {
      return createErrorResponse("EMPTY_PROMPT", "Please enter an edit instruction", 400, correlationId);
    }

    // Credit check (use database user ID)
    // For Pro users, edits cost 1 credit (fixed cost)
    // For Free users, use standard credit check
    const creditCheck = await checkCredits(dbUserId);
    const userTier = creditCheck.tier;
    
    if (userTier === "PRO") {
      // Pro users: check if they have at least 1 credit
      if (creditCheck.remainingCredits < 1) {
        return createErrorResponse(
          "CREDITS_EXHAUSTED",
          "Not enough Pro credits. Edits cost 1 credit each.",
          402,
          correlationId
        );
      }
    } else {
      // Free users: standard check
      if (!creditCheck.allowed) {
        return createErrorResponse(
          "CREDITS_EXHAUSTED",
          "You've used all your free generations today. Upgrade to Pro for unlimited access",
          402,
          correlationId
        );
      }
    }
    const creditVersion = creditCheck.version;

    // Acquire lock
    lockAcquired = await acquireGenerationLock(clerkId);
    if (!lockAcquired) {
      return createErrorResponse(
        "GENERATION_IN_PROGRESS",
        "Please wait for your current operation to complete",
        409,
        correlationId
      );
    }

    // Detect if user wants a completely new design
    const isNewDesignRequest = /(?:create|make|build|generate|design|new|completely new|from scratch|start over|fresh|entirely new)/i.test(editInstruction) &&
      !/(?:edit|modify|change|update|adjust|fix|replace|remove|add|delete)/i.test(editInstruction);
    
    // Build prompts
    let systemPrompt: string;
    let userPrompt: string;
    
    if (isNewDesignRequest) {
      // For new design requests, use generation-style prompt
      systemPrompt = `You are an Elite Web Design AI. Generate a complete, production-ready HTML page based on the user's request.
      
CRITICAL REQUIREMENTS:
- Output ONLY valid HTML (no markdown, no explanations)
- Start directly with <!DOCTYPE html>
- Include all necessary CSS inline or in <style> tags
- Use Tailwind CSS classes for styling
- Include proper semantic HTML structure
- Add smooth animations and transitions
- Ensure mobile responsiveness
- Use Lucide icons (via CDN: https://unpkg.com/lucide@latest)
- Include placeholder images with data-image-query attributes for Unsplash integration
- Make the design modern, polished, and visually appealing`;
      
      userPrompt = `Generate a complete HTML page for: ${editInstruction}`;
    } else {
      // For targeted edits, use existing edit system
      systemPrompt = buildEditSystemPrompt();
      userPrompt = buildEditUserPrompt(currentHtml, editInstruction);
    }

    // Create SSE stream
    const customStream = new ReadableStream<Uint8Array>({
      async start(controller) {
        const MAX_RETRIES = 2;
        let attempt = 0;
        let finalHtml = currentHtml;
        let lastFailedBlocks: { index: number; reason: string }[] = [];

        controller.enqueue(textEncoder.encode(encodeSSEEvent({
          type: "status",
          message: "Analyzing edit request...",
        })));

        while (attempt <= MAX_RETRIES) {
          try {
            const startTime = Date.now();
            
            console.log({
              event: "edit_attempt_start",
              correlationId,
              userId,
              attempt,
              htmlLength: currentHtml.length,
              instructionLength: editInstruction.length,
              timestamp: new Date().toISOString(),
            });

            // Call DeepSeek with appropriate settings
            // For new designs, use higher temperature; for edits, use lower temperature
            const result = streamText({
              model: deepseek("deepseek-chat"),
              system: systemPrompt,
              messages: [{ role: "user", content: userPrompt }],
              temperature: isNewDesignRequest ? 1.0 : 0.2, // Higher temp for creativity in new designs
              maxOutputTokens: 8000, // DeepSeek beta supports up to 8K tokens
              abortSignal: AbortSignal.timeout(isNewDesignRequest ? 120000 : 60000), // Longer timeout for new designs
            });

            // Collect full response
            let fullResponse = "";
            for await (const part of result.fullStream) {
              if (part.type === "text-delta") {
                fullResponse += part.text;
              }
            }

            const duration = Date.now() - startTime;
            
            // Get token usage if available
            let tokenUsage = { input: 0, output: 0 };
            try {
              const usage = await result.usage;
              // Use type assertion to access token usage properties
              const usageAny = usage as any;
              tokenUsage = { 
                input: usageAny.promptTokens ?? usageAny.inputTokens ?? 0, 
                output: usageAny.completionTokens ?? usageAny.outputTokens ?? 0 
              };
            } catch {
              // Token usage not available
            }

            console.log({
              event: "edit_response_received",
              correlationId,
              responseLength: fullResponse.length,
              durationMs: duration,
              tokenUsage,
              attempt,
              timestamp: new Date().toISOString(),
            });

            // For new design requests, return the full HTML directly
            if (isNewDesignRequest) {
              // Inject Unsplash images using our proxy API
              const { injectUnsplashImages } = await import("~/server/lib/html-processor");
              const baseUrl = new URL(req.url).origin;
              const htmlWithImages = await injectUnsplashImages(fullResponse, baseUrl);
              
              controller.enqueue(textEncoder.encode(encodeSSEEvent({
                type: "complete",
                message: "New design generated",
                newHtml: htmlWithImages,
                appliedBlocks: 0,
                failedBlocks: 0,
              })));
              finalHtml = htmlWithImages;
              break;
            }

            // Parse search/replace blocks for targeted edits
            const parseResult = parseSearchReplaceBlocks(fullResponse);

            if (parseResult.noChanges) {
              // No changes needed
              controller.enqueue(textEncoder.encode(encodeSSEEvent({
                type: "complete",
                message: "No changes required",
                newHtml: currentHtml,
                appliedBlocks: 0,
                failedBlocks: 0,
              })));
              break;
            }

            if (parseResult.blocks.length === 0) {
              // No blocks found - might be malformed response
              controller.enqueue(textEncoder.encode(encodeSSEEvent({
                type: "error",
                code: "EDIT_FAILED",
                message: "Could not parse edit instructions. Please try rephrasing your request.",
              })));
              break;
            }

            // Apply blocks
            const applyResult = applySearchReplaceBlocks(finalHtml, parseResult.blocks);

            console.log({
              event: "edit_blocks_applied",
              correlationId,
              totalBlocks: parseResult.blocks.length,
              appliedBlocks: applyResult.appliedBlocks.length,
              failedBlocks: applyResult.failedBlocks.length,
              attempt,
            });

            if (applyResult.success) {
              // All blocks applied successfully
              finalHtml = applyResult.newContent;
              
              controller.enqueue(textEncoder.encode(encodeSSEEvent({
                type: "edit-applied",
                newHtml: finalHtml,
                appliedBlocks: applyResult.appliedBlocks.length,
                failedBlocks: 0,
                message: `Edit completed in ${duration}ms (${tokenUsage.input + tokenUsage.output} tokens)`,
              })));

              controller.enqueue(textEncoder.encode(encodeSSEEvent({
                type: "complete",
                finishReason: "stop",
                newHtml: finalHtml,
                appliedBlocks: applyResult.appliedBlocks.length,
                failedBlocks: 0,
              })));
              break;
            }

            // Some blocks failed
            if (applyResult.appliedBlocks.length > 0) {
              // Partial success - update finalHtml with what worked
              finalHtml = applyResult.newContent;
            }

            lastFailedBlocks = applyResult.failedBlocks;

            if (attempt < MAX_RETRIES) {
              // Retry with failed blocks
              controller.enqueue(textEncoder.encode(encodeSSEEvent({
                type: "status",
                message: `Retrying ${lastFailedBlocks.length} failed edit(s)...`,
              })));

              // Build retry prompt
              userPrompt = buildRetryPrompt(finalHtml, lastFailedBlocks, editInstruction);
              attempt++;
            } else {
              // Max retries reached
              if (applyResult.appliedBlocks.length > 0) {
                // Partial success
                controller.enqueue(textEncoder.encode(encodeSSEEvent({
                  type: "edit-applied",
                  newHtml: finalHtml,
                  appliedBlocks: applyResult.appliedBlocks.length,
                  failedBlocks: lastFailedBlocks.length,
                  message: `Applied ${applyResult.appliedBlocks.length} edit(s), ${lastFailedBlocks.length} failed`,
                })));

                controller.enqueue(textEncoder.encode(encodeSSEEvent({
                  type: "complete",
                  finishReason: "partial",
                  newHtml: finalHtml,
                  appliedBlocks: applyResult.appliedBlocks.length,
                  failedBlocks: lastFailedBlocks.length,
                })));
              } else {
                // Complete failure
                controller.enqueue(textEncoder.encode(encodeSSEEvent({
                  type: "error",
                  code: "EDIT_FAILED",
                  message: "Could not apply the requested edits. Please try a different approach.",
                })));
              }
              break;
            }
          } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            
            console.error({
              event: "edit_error",
              correlationId,
              error: errorMessage,
              attempt,
            });

            if (errorMessage.includes("429")) {
              controller.enqueue(textEncoder.encode(encodeSSEEvent({
                type: "error",
                code: "AI_SERVICE_BUSY",
                message: "AI service is busy. Please try again in a few seconds.",
              })));
            } else {
              controller.enqueue(textEncoder.encode(encodeSSEEvent({
                type: "error",
                code: "INTERNAL_ERROR",
                message: "An error occurred while processing your edit.",
              })));
            }
            break;
          }
        }

        // Decrement credits
        // Pro users: 1 credit per edit (fixed cost)
        // Free users: 1 credit per edit
        if (dbUserId) {
          try {
            if (userTier === "PRO") {
              // Pro users: decrement 1 credit using OCC
              const { db } = await import("~/server/db");
              await db.user.updateMany({
                where: {
                  id: dbUserId,
                  version: creditVersion,
                  credits: { gte: 1 },
                },
                data: {
                  credits: { decrement: 1 },
                  version: { increment: 1 },
                },
              });
            } else {
              // Free users: use standard decrement
              await decrementCredits(dbUserId, creditVersion);
            }
          } catch (e) {
            console.error({ event: "credit_decrement_failed", dbUserId, error: e });
          }
        }

        // Release lock
        if (clerkId && lockAcquired) {
          await releaseGenerationLock(clerkId);
          lockAcquired = false;
        }

        controller.close();
      },
      cancel() {
        if (clerkId && lockAcquired) {
          releaseGenerationLock(clerkId).catch(console.error);
        }
      },
    });

    return new Response(customStream, {
      headers: {
        "Content-Type": "text/event-stream",
        "X-Correlation-Id": correlationId,
        "Cache-Control": "no-cache, no-store, must-revalidate",
        Connection: "keep-alive",
      },
    });
  } catch (error) {
    console.error({
      event: "edit_fatal_error",
      correlationId,
      error: error instanceof Error ? error.message : "Unknown error",
    });

    return createErrorResponse(
      "INTERNAL_ERROR",
      `Something went wrong. Please try again (Error ID: ${correlationId})`,
      500,
      correlationId
    );
  } finally {
    if (clerkId && lockAcquired) {
      await releaseGenerationLock(clerkId);
    }
  }
}
