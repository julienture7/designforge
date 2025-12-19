/**
 * POST /api/generate
 * 
 * AI generation with SSE streaming for real-time code display.
 * Streams HTML chunks as they're generated, then sends final complete HTML.
 * 
 * ANONYMOUS users can use:
 * - Basic mode: Devstral (FREE, unlimited, IP rate-limited)
 * 
 * FREE users (registered) can choose:
 * - Basic mode: Devstral (FREE, no credits)
 * - Medium mode: DeepSeek (4 credits)
 * 
 * PRO users can choose:
 * - Basic mode: Devstral (FREE, no credits)
 * - Medium mode: DeepSeek (4 credits)
 * - High mode: Gemini 3 Pro (10 credits)
 */

import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createMistral } from "@ai-sdk/mistral";
import { createDeepSeek } from "@ai-sdk/deepseek";
import { generateText, streamText } from "ai";
import { type NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { env } from "~/env";
import { db } from "~/server/db";

// Create Mistral client for Devstral (Basic mode - FREE for all)
const mistral = createMistral({
  apiKey: env.MISTRAL_API_KEY,
});

// Create DeepSeek client (Medium mode - requires account)
const deepseek = createDeepSeek({
  apiKey: env.DEEPSEEK_API_KEY,
});

// Create Google Generative AI client (PRO tier - Gemini 3 Pro Preview)
const google = createGoogleGenerativeAI({
  apiKey: env.GEMINI_API_KEY,
});

import { getOrCreateUser } from "~/server/auth";
import { acquireGenerationLock, releaseGenerationLock, redis } from "~/server/lib/redis";
import { checkCredits, decrementCredits, getGenerationCreditCost, type GenerationMode } from "~/server/services/credit.service";
import { checkRateLimit, createRateLimitResponse, getClientIp } from "~/server/lib/rate-limiter";
import { type Tier } from "~/server/lib/tier-utils";
import { injectUnsplashImages } from "~/server/lib/html-processor";
import { getDevstralSystemPrompt } from "~/server/lib/devstral-prompt";
import { getBriefGeneratorPrompt } from "~/server/lib/brief-generator";

// Vercel timeout: 300s (Hobby), 900s (Pro/Enterprise)
export const maxDuration = 300;
export const dynamic = "force-dynamic";


// PRO tier prompt (Gemini)
const DESIGN_SYSTEM_PROMPT = `You are OmniFlow, an Elite Product Architect and Senior Frontend Engineer. You do not build "websites"; you engineer Digital Experiences that sit at the intersection of Brutalism, Swiss Design, and High-Fashion Editorial.

OBJECTIVE:
Take a user's prompt (vague or specific) and autonomously construct a single-file, launch-ready HTML interface. Your goal is to generate a result that generates "Visual Tension" and would be nominated for "Awwwards Site of the Day."

CONTEXTUAL ADAPTATION:
While maintaining the bold aesthetic, ensure the design feels appropriate for its domain. A restaurant should feel like a credible restaurant, a SaaS product should feel like a professional tool, a portfolio should feel like an artist's showcase.

THE "ANTI-BOREDOM" DIRECTIVE:
- NO GENERIC RADIUS/SHADOWS: Use sharp edges (rounded-none) or extreme curvature (rounded-full).
- NO "BOOTSTRAP BLUE": Use Electric Acid Green, International Orange, Deep Slate, or Monochromatic Luxury.
- NO LOREM IPSUM: Write arrogant, punchy, high-conversion marketing copy.
- NO STATIC LAYOUTS: Include scroll-triggered animations.

VISUAL PHYSICS & DESIGN SYSTEM:
- Fluid Typography: Use Tailwind arbitrary values for massive scale contrast.
- Font Pairing: Mix Technical/Mono font with Emotive/Display font via Google Fonts CDN.
- Grid Visibility: Use 1px borders, subtle grid lines, crosshairs, and technical data markers.

ARCHITECTURAL AUTONOMY:
- Restaurant: Hero -> Menu -> Philosophy -> Reservation Interface -> Footer
- SaaS: Value Prop Hero -> Social Proof -> Feature Grid -> Pricing -> CTA

TECHNICAL CONSTRAINTS:
- Output: Single HTML file starting with <!DOCTYPE html>
- CSS: Tailwind CSS via CDN with arbitrary values
- Icons: Lucide icons via CDN

IMAGES (CRITICAL):
Use data-image-query and data-bg-query attributes for ALL images:
<img data-image-query="modern architecture minimalist" alt="Modern building" class="w-full h-full object-cover">
<div data-bg-query="dark moody interior lighting" class="bg-cover bg-center">...</div>

NEVER use source.unsplash.com URLs or any other image service.

JavaScript: Include IntersectionObserver for scroll animations and mobile navigation overlay.

OUTPUT ONLY THE HTML. No markdown code blocks. No explanations. Start directly with <!DOCTYPE html>.`;

/**
 * Acquire a generation lock for anonymous users based on IP
 */
async function acquireAnonymousLock(ip: string): Promise<boolean> {
  const lockKey = `lock:anonymous:${ip}`;
  const result = await redis.set(lockKey, "1", { nx: true, ex: 300 }); // 5 min timeout
  return result === "OK";
}

/**
 * Release generation lock for anonymous users
 */
async function releaseAnonymousLock(ip: string): Promise<void> {
  const lockKey = `lock:anonymous:${ip}`;
  await redis.del(lockKey);
}

export async function POST(req: NextRequest) {
  let clerkId: string | null = null;
  let dbUserId: string | null = null;
  let lockAcquired = false;
  let isAnonymous = false;
  let clientIp: string | null = null;

  try {
    const { userId } = await auth();

    // Rate Limiting (applies to both authenticated and anonymous)
    const rateLimitResult = await checkRateLimit(req, true);
    if (!rateLimitResult.success) {
      return createRateLimitResponse(rateLimitResult);
    }

    // Parse request body first to check generation mode
    const body = await req.json();
    const { messages = [], currentHtml, prompt, useProTrial = false, generationMode = "basic" } = body;

    // Determine if this is an anonymous request
    isAnonymous = !userId;
    clientIp = getClientIp(req);

    // ANONYMOUS USER FLOW
    if (isAnonymous) {
      // Anonymous users can ONLY use basic mode
      if (generationMode !== "basic") {
        return NextResponse.json({ 
          error: "Sign up to access Medium and High modes. Basic mode is free!", 
          code: "SIGNUP_REQUIRED" 
        }, { status: 403 });
      }

      // Use IP-based lock for anonymous users
      lockAcquired = await acquireAnonymousLock(clientIp);
      if (!lockAcquired) {
        return NextResponse.json({ 
          error: "Generation in progress. Please wait.", 
          code: "GENERATION_IN_PROGRESS" 
        }, { status: 409 });
      }

      // Generate with streaming for anonymous users too
      const baseUrl = new URL(req.url).origin;
      const capturedClientIp = clientIp;
      
      // Step 1: Generate brief (non-streaming)
      const userRequest = prompt || "";
      const briefResult = await generateText({
        model: mistral("devstral-2512"),
        messages: [{ role: "user" as const, content: getBriefGeneratorPrompt(userRequest) }],
        temperature: 0.7,
        maxOutputTokens: 1024,
      });
      
      let contextPrompt = "";
      if (currentHtml) {
        contextPrompt = `\n\nCURRENT HTML (modify this based on user request):\n${currentHtml}\n\n`;
      }
      const briefPrompt = getDevstralSystemPrompt(briefResult.text) + contextPrompt;

      // Create SSE stream
      const encoder = new TextEncoder();
      const stream = new ReadableStream({
        async start(controller) {
          try {
            let fullHtml = "";
            
            const result = streamText({
              model: mistral("devstral-2512"),
              messages: [{ role: "user" as const, content: briefPrompt }],
              temperature: 1.0,
              maxOutputTokens: 16384,
            });

            for await (const chunk of result.textStream) {
              fullHtml += chunk;
              const chunkData = JSON.stringify({ type: "chunk", content: chunk, partial: fullHtml });
              controller.enqueue(encoder.encode(`data: ${chunkData}\n\n`));
            }

            // Clean up
            fullHtml = fullHtml.replace(/^```html\s*/i, "").replace(/```\s*$/, "").trim();
            if (!fullHtml.toLowerCase().startsWith("<!doctype")) {
              const doctypeIndex = fullHtml.toLowerCase().indexOf("<!doctype");
              if (doctypeIndex > 0) {
                fullHtml = fullHtml.substring(doctypeIndex);
              }
            }

            // Inject images
            const htmlWithImages = await injectUnsplashImages(fullHtml, baseUrl);

            // Release lock
            await releaseAnonymousLock(capturedClientIp);

            // Send complete
            const completeData = JSON.stringify({
              type: "complete",
              html: htmlWithImages,
              finishReason: "stop",
              generationMode: "basic",
              creditCost: 0,
              isAnonymous: true,
            });
            controller.enqueue(encoder.encode(`data: ${completeData}\n\n`));
            controller.close();
          } catch (error) {
            console.error("Anonymous streaming error:", error);
            await releaseAnonymousLock(capturedClientIp).catch(console.error);
            const errorData = JSON.stringify({ type: "error", message: "Generation failed", code: "STREAM_ERROR" });
            controller.enqueue(encoder.encode(`data: ${errorData}\n\n`));
            controller.close();
          }
        },
      });

      return new Response(stream, {
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          "Connection": "keep-alive",
        },
      });
    }

    // AUTHENTICATED USER FLOW
    // At this point `userId` is guaranteed to be present (anonymous requests returned above)
    clerkId = userId!;

    // Get or create user in database
    const user = await getOrCreateUser();
    if (!user) {
      return NextResponse.json({ error: "User not found", code: "USER_NOT_FOUND" }, { status: 404 });
    }
    dbUserId = user.id;

    // Credit Check based on tier
    const userTier = (user.tier as Tier) || "FREE";
    let creditVersion: number | undefined;
    let consumeTrial = false;

    // Validate generation mode based on tier
    // FREE: basic (free), medium (4 credits)
    // PRO: basic (free), medium (4 credits), high (10 credits)
    const freeValidModes: GenerationMode[] = ["basic", "medium"];
    const proValidModes: GenerationMode[] = ["basic", "medium", "high"];
    
    let selectedGenerationMode: GenerationMode;
    if (userTier === "PRO") {
      selectedGenerationMode = proValidModes.includes(generationMode) ? generationMode : "high";
    } else {
      selectedGenerationMode = freeValidModes.includes(generationMode) ? generationMode : "basic";
    }

    // Calculate credit cost based on mode
    // Basic mode is FREE for all authenticated users
    let creditCost = selectedGenerationMode === "basic" ? 0 : getGenerationCreditCost(selectedGenerationMode);

    if (userTier === "PRO") {
      // PRO tier: Can use all modes
      if (creditCost > 0) {
        const creditCheck = await checkCredits(dbUserId);
        if (creditCheck.remainingCredits < creditCost) {
          return NextResponse.json({ 
            error: `Need ${creditCost} credits but only have ${creditCheck.remainingCredits}. Try Basic mode (free) or a lower tier.`, 
            code: "CREDITS_EXHAUSTED" 
          }, { status: 402 });
        }
        creditVersion = creditCheck.version;
      }
    } else {
      // FREE tier - can only use basic and medium
      if (selectedGenerationMode === "high") {
        return NextResponse.json({ 
          error: "High tier requires Pro subscription. Upgrade to access premium AI.", 
          code: "UPGRADE_REQUIRED" 
        }, { status: 403 });
      }
      
      if (useProTrial) {
        if (user.proTrialUsed) {
          return NextResponse.json(
            { error: "Pro trial already used. Upgrade to Pro for access to High tier.", code: "TRIAL_EXHAUSTED" },
            { status: 402 }
          );
        }
        // Pro trial uses high mode
        selectedGenerationMode = "high";
        consumeTrial = true;
        creditCost = 1; // Pro trial costs 1 credit only
        const creditCheck = await checkCredits(dbUserId);
        if (!creditCheck.allowed) {
          return NextResponse.json({ error: "No credits remaining", code: "CREDITS_EXHAUSTED" }, { status: 402 });
        }
        creditVersion = creditCheck.version;
      } else if (creditCost > 0) {
        // Check if user has enough credits for medium mode
        const creditCheck = await checkCredits(dbUserId);
        if (creditCheck.remainingCredits < creditCost) {
          return NextResponse.json({ 
            error: `Need ${creditCost} credits but only have ${creditCheck.remainingCredits}. Try Basic mode (free) or upgrade to Pro.`, 
            code: "CREDITS_EXHAUSTED" 
          }, { status: 402 });
        }
        creditVersion = creditCheck.version;
      }
    }

    // Lock (use Clerk ID for uniqueness)
    lockAcquired = await acquireGenerationLock(clerkId!);
    if (!lockAcquired) {
      return NextResponse.json({ error: "Generation in progress", code: "GENERATION_IN_PROGRESS" }, { status: 409 });
    }

    // Build context for the AI
    let contextPrompt = "";
    if (currentHtml) {
      contextPrompt = `\n\nCURRENT HTML (modify this based on user request):\n${currentHtml}\n\n`;
    }

    // Build messages array for the AI
    const aiMessages: Array<{ role: "user" | "assistant"; content: string }> = [];
    for (const msg of messages) {
      aiMessages.push({
        role: msg.role === "assistant" ? "assistant" : "user",
        content: msg.content,
      });
    }
    if (prompt) {
      aiMessages.push({ role: "user", content: prompt });
    }

    // Select model and prompt based on generation mode
    let selectedModel;
    let systemPrompt: string;
    let maxOutputTokens: number;
    const isHighMode = selectedGenerationMode === "high";

    if (isHighMode) {
      // High mode: Use Gemini 3 Pro (PRO only or trial)
      selectedModel = google("gemini-3-pro-preview");
      systemPrompt = DESIGN_SYSTEM_PROMPT + contextPrompt;
      maxOutputTokens = 16000;
    } else if (selectedGenerationMode === "medium") {
      // Medium mode: Use DeepSeek
      selectedModel = deepseek("deepseek-chat");
      systemPrompt = ""; // Full prompt goes in user message
      maxOutputTokens = 8192; // DeepSeek max is 8192
    } else {
      // Basic mode: Use Devstral
      selectedModel = mistral("devstral-2512");
      systemPrompt = ""; // Full prompt goes in user message
      maxOutputTokens = 16384;
    }

    // For Basic/Medium modes, we need to generate the brief first (non-streaming)
    // Then stream the HTML generation
    let briefPrompt = "";
    if (!isHighMode) {
      const userRequest = prompt || "";
      const briefResult = await generateText({
        model: selectedModel,
        messages: [{ role: "user" as const, content: getBriefGeneratorPrompt(userRequest) }],
        temperature: 0.7,
        maxOutputTokens: 1024,
      });
      briefPrompt = getDevstralSystemPrompt(briefResult.text) + contextPrompt;
    }

    // Create SSE stream for real-time code display
    const encoder = new TextEncoder();
    const baseUrl = new URL(req.url).origin;
    
    // Capture these for use in the stream
    const capturedDbUserId = dbUserId;
    const capturedClerkId = clerkId;
    const capturedCreditVersion = creditVersion;
    const capturedCreditCost = creditCost;
    const capturedConsumeTrial = consumeTrial;

    const stream = new ReadableStream({
      async start(controller) {
        try {
          let fullHtml = "";
          
          // Stream the HTML generation
          const streamConfig = isHighMode
            ? {
                model: selectedModel,
                system: systemPrompt,
                messages: aiMessages,
                temperature: 1.0,
                maxOutputTokens,
              }
            : {
                model: selectedModel,
                messages: [{ role: "user" as const, content: briefPrompt }],
                temperature: 1.0,
                maxOutputTokens,
              };

          const result = streamText(streamConfig);

          // Stream chunks as they arrive
          for await (const chunk of result.textStream) {
            fullHtml += chunk;
            // Send streaming chunk
            const chunkData = JSON.stringify({ type: "chunk", content: chunk, partial: fullHtml });
            controller.enqueue(encoder.encode(`data: ${chunkData}\n\n`));
          }

          // Clean up markdown code blocks if present
          fullHtml = fullHtml.replace(/^```html\s*/i, "").replace(/```\s*$/, "").trim();
          // Ensure it starts with <!DOCTYPE html>
          if (!fullHtml.toLowerCase().startsWith("<!doctype")) {
            const doctypeIndex = fullHtml.toLowerCase().indexOf("<!doctype");
            if (doctypeIndex > 0) {
              fullHtml = fullHtml.substring(doctypeIndex);
            }
          }

          // Inject real Unsplash images
          const htmlWithImages = await injectUnsplashImages(fullHtml, baseUrl);

          // Charge credits + release lock only after successful generation
          if (capturedDbUserId && capturedClerkId) {
            if (typeof capturedCreditVersion === "number" && capturedCreditCost > 0) {
              await decrementCredits(capturedDbUserId, capturedCreditVersion, capturedCreditCost).catch(console.error);
            }
            
            if (capturedConsumeTrial) {
              await db.user.update({
                where: { id: capturedDbUserId },
                data: { proTrialUsed: true },
              }).catch(console.error);
            }
            
            await releaseGenerationLock(capturedClerkId).catch(console.error);
          }

          // Send final complete message
          const completeData = JSON.stringify({
            type: "complete",
            html: htmlWithImages,
            finishReason: "stop",
            generationMode: selectedGenerationMode,
            creditCost: capturedCreditCost,
          });
          controller.enqueue(encoder.encode(`data: ${completeData}\n\n`));
          controller.close();
        } catch (error) {
          console.error("Streaming error:", error);
          // Release locks on error
          if (capturedClerkId) {
            await releaseGenerationLock(capturedClerkId).catch(console.error);
          }
          const errorData = JSON.stringify({ type: "error", message: "Generation failed", code: "STREAM_ERROR" });
          controller.enqueue(encoder.encode(`data: ${errorData}\n\n`));
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        "Connection": "keep-alive",
      },
    });

  } catch (error) {
    console.error("Generation error:", error);
    // Release locks on error
    if (clerkId && lockAcquired) {
      await releaseGenerationLock(clerkId);
    }
    if (isAnonymous && clientIp && lockAcquired) {
      await releaseAnonymousLock(clientIp);
    }
    return NextResponse.json({ error: "Internal Error", code: "INTERNAL_ERROR" }, { status: 500 });
  }
}

/**
 * Generate HTML using basic mode (Devstral)
 * Used for both anonymous and authenticated users
 */
async function generateBasicMode(
  prompt: string,
  currentHtml: string | undefined,
  messages: Array<{ role: string; content: string }>
): Promise<string> {
  let contextPrompt = "";
  if (currentHtml) {
    contextPrompt = `\n\nCURRENT HTML (modify this based on user request):\n${currentHtml}\n\n`;
  }

  // Step 1: Generate detailed brief from user's simple prompt
  const userRequest = prompt || "";
  const briefResult = await generateText({
    model: mistral("devstral-2512"),
    messages: [{ role: "user" as const, content: getBriefGeneratorPrompt(userRequest) }],
    temperature: 0.7,
    maxOutputTokens: 1024,
  });
  const generatedBrief = briefResult.text;
  
  // Step 2: Generate HTML using the detailed brief
  const fullPrompt = getDevstralSystemPrompt(generatedBrief) + contextPrompt;
  const htmlResult = await generateText({
    model: mistral("devstral-2512"),
    messages: [{ role: "user" as const, content: fullPrompt }],
    temperature: 1.0,
    maxOutputTokens: 16384,
  });
  let html = htmlResult.text;
  
  // Clean up markdown code blocks if present
  html = html.replace(/^```html\s*/i, "").replace(/```\s*$/, "").trim();
  // Ensure it starts with <!DOCTYPE html>
  if (!html.toLowerCase().startsWith("<!doctype")) {
    const doctypeIndex = html.toLowerCase().indexOf("<!doctype");
    if (doctypeIndex > 0) {
      html = html.substring(doctypeIndex);
    }
  }

  return html;
}
