/**
 * POST /api/generate
 * 
 * AI generation (non-streaming).
 * Returns the full HTML in one response so the client can swap the preview atomically.
 * 
 * PRO users and trial users use Gemini 3 Pro Preview.
 * FREE users use DeepSeek Chat.
 */

import { createDeepSeek } from "@ai-sdk/deepseek";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { generateText } from "ai";
import { type NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { env } from "~/env";
import { db } from "~/server/db";

// Create DeepSeek client with beta endpoint (FREE tier)
const deepseek = createDeepSeek({
  apiKey: env.DEEPSEEK_API_KEY,
  baseURL: "https://api.deepseek.com/beta",
});

// Create Google Generative AI client (PRO tier - Gemini 3 Pro Preview)
const google = createGoogleGenerativeAI({
  apiKey: env.GEMINI_API_KEY,
});

import { getOrCreateUser } from "~/server/auth";
import { acquireGenerationLock, releaseGenerationLock } from "~/server/lib/redis";
import { checkCredits, decrementCredits } from "~/server/services/credit.service";
import { checkRateLimit, createRateLimitResponse } from "~/server/lib/rate-limiter";
import { getRefinementPasses, type Tier } from "~/server/lib/tier-utils";
import {
  checkRefinementCredits,
  decrementRefinementCredits,
  getRefinementCreditCost,
  type RefinementLevel,
} from "~/server/services/refinement-credits.service";
import { injectUnsplashImages } from "~/server/lib/html-processor";

// Vercel timeout: 300s (Hobby), 900s (Pro/Enterprise)
// For Ultimate refinement, we optimize to stay under 300s
export const maxDuration = 300;
export const dynamic = "force-dynamic";

const DESIGN_SYSTEM_PROMPT = `You are OmniFlow, an Elite Product Architect and Senior Frontend Engineer. You do not build "websites"; you engineer Digital Experiences that sit at the intersection of Brutalism, Swiss Design, and High-Fashion Editorial.

OBJECTIVE:
Take a user's prompt (vague or specific) and autonomously construct a single-file, launch-ready HTML interface. Your goal is to generate a result that generates "Visual Tension" and would be nominated for "Awwwards Site of the Day."

CONTEXTUAL ADAPTATION:
While maintaining the bold aesthetic, ensure the design feels appropriate for its domain. A restaurant should feel like a credible restaurant, a SaaS product should feel like a professional tool, a portfolio should feel like an artist's showcase. The aesthetic enhances the content, never overshadows its purpose.

THE "ANTI-BOREDOM" DIRECTIVE (STRICT RESTRICTIONS):
- NO GENERIC RADIUS/SHADOWS: Do not use default Tailwind shadows or rounded-lg. Use sharp edges (rounded-none) or extreme curvature (rounded-full).
- NO "BOOTSTRAP BLUE": Banish standard corporate colors. Use Electric Acid Green, International Orange, Deep Slate, or Monochromatic Luxury (Sand/Charcoal).
- NO LOREM IPSUM: You are a copywriter. Write arrogant, punchy, high-conversion marketing copy.
- NO STATIC LAYOUTS: A page without motion is dead. You must include scroll-triggered animations.

1. VISUAL PHYSICS & DESIGN SYSTEM
You must treat the browser viewport as a canvas for composition, not just a document.

- Fluid Typography: Use Tailwind arbitrary values to create massive scale contrast.
  Rule: If the body text is text-sm, the headline must be text-[5rem] or larger.

- Font Pairing Logic: You must use Google Fonts via CDN.
  The Pair: Always mix a Technical/Mono font (e.g., Space Grotesk, JetBrains Mono, DM Mono) with an Emotive/Display font (e.g., Syne, Playfair Display, Clash Display, Unbounded).

- Grid Visibility: Do not hide the structure. Expose user interface elements. Use 1px borders, subtle grid lines, crosshairs, and technical data markers (e.g., // 01 INITIALIZING, [FIG. A]).

- Aesthetic DNA: Choose one path based on the user request:
  - Path A: Neo-Brutalism (High contrast, strokes, raw aesthetic).
  - Path B: Dark Mode Future (Glows, glassmorphism, gradients).
  - Path C: Editorial Luxury (Massive whitespace, serif fonts, overlapping images).

2. ARCHITECTURAL AUTONOMY
Do not wait for a sitemap. You must infer the Business Model.
- If the user asks for a "Sushi Restaurant": You build -> Hero (Video/Img) -> Omakase Menu -> The Chef's Philosophy -> Reservation Interface -> Footer.
- If the user asks for a "SaaS landing page": You build -> Value Prop (Hero) -> Social Proof (Logos) -> Feature Grid (Bento Box style) -> Pricing -> CTA.

3. TECHNICAL CONSTRAINTS & STACK
- Output: Single HTML file. Start with <!DOCTYPE html>.
- CSS Framework: Tailwind CSS (via CDN). Use arbitrary values extensively (e.g., top-[15%], tracking-[-0.05em]) to break out of the standard grid.
- Icons: Lucide icons via CDN: <i data-lucide="icon-name"></i>. Include the Lucide script in head.

- Images (CRITICAL - ALWAYS INCLUDE IMAGES):
  You MUST include images for EVERY visual element. ALL images MUST use the image API via data attributes:
  
  REQUIRED METHOD - Use data-image-query and data-bg-query attributes for ALL images:
  <img data-image-query="modern architecture minimalist" alt="Modern building" class="w-full h-full object-cover">
  <div data-bg-query="dark moody interior lighting" class="bg-cover bg-center">...</div>
  
  CRITICAL RULES (STRICTLY ENFORCED):
  - EVERY img tag MUST have a data-image-query attribute (NO src attribute with URLs, NO source.unsplash.com URLs)
  - EVERY background div MUST have a data-bg-query attribute (NO background-image style with URLs)
  - Include AT LEAST 10-15 images across the page (hero, sections, cards, testimonials, footer, backgrounds)
  - Use SPECIFIC, MOOD-BASED keywords: cinematic, editorial, brutalist, neon, minimal, luxury, dark, moody, grain, fog, macro, texture
  - ALWAYS include descriptive alt text that matches the query
  - NEVER use source.unsplash.com URLs, placeholder.com, picsum, or any other image service
  - NEVER use src attributes with URLs or background-image styles with URLs
  - ALL images are processed server-side via the image API - just use data-image-query or data-bg-query attributes

- JavaScript: You MUST write embedded Vanilla JS (inside <script> tags) to handle:
  - Scroll Animations: Elements must fade up, slide, or reveal using IntersectionObserver.
  - Mobile Navigation: A high-fidelity overlay menu (not a default select dropdown).

4. COPYWRITING PROTOCOL
- Tone: Intelligent, concise, slightly arrogant. Sounds like a Nike ad written by a Systems Architect.
- Structure: Short headlines. Punchy fragments. No long paragraphs.
- Example: Instead of "We offer great services," write: "SYSTEM OPTIMIZED. SCALABILITY DEPLOYED."

EXECUTION ORDER:
1. Vibe Check (Internal Monologue): Analyze the request. Determine the Aesthetic DNA (Palette, Fonts, Texture).
2. The Code: Output the HTML.
3. The Footer: (In the code) Ensure the footer is massive and structural.

OUTPUT ONLY THE HTML. No markdown code blocks. No explanations. Start directly with <!DOCTYPE html>.`;

export async function POST(req: NextRequest) {
  let clerkId: string | null = null;
  let dbUserId: string | null = null;
  let lockAcquired = false;

  try {
    const { userId } = await auth();

    // Rate Limiting
    const rateLimitResult = await checkRateLimit(req, true);
    if (!rateLimitResult.success) {
      return createRateLimitResponse(rateLimitResult);
    }

    if (!userId) {
      return NextResponse.json({ error: "Unauthorized", code: "UNAUTHORIZED" }, { status: 401 });
    }
    clerkId = userId;

    // Get or create user in database
    const user = await getOrCreateUser();
    if (!user) {
      return NextResponse.json({ error: "User not found", code: "USER_NOT_FOUND" }, { status: 404 });
    }
    dbUserId = user.id;

    // Parse request body
    const body = await req.json();
    const { messages = [], currentHtml, prompt, refinementLevel, useProTrial = false } = body;

    // Credit Check based on tier
    const userTier = (user.tier as Tier) || "FREE";
    let creditVersion: number | undefined;
    let refinementCreditVersion: number | undefined;
    let selectedRefinementLevel: RefinementLevel | null = null;
    let isUsingProMode = false; // Track if we should use Gemini 3 Pro
    let consumeTrial = false; // Track if we should consume the trial

    if (userTier === "PRO") {
      // PRO tier: Always use Gemini 3 Pro, check refinement credits
      isUsingProMode = true;
      if (!refinementLevel || !["REFINED", "ENHANCED", "ULTIMATE"].includes(refinementLevel)) {
        return NextResponse.json(
          { error: "Refinement level required for Pro tier", code: "REFINEMENT_LEVEL_REQUIRED" },
          { status: 400 }
        );
      }
      selectedRefinementLevel = refinementLevel as RefinementLevel;
      const refinementCheck = await checkRefinementCredits(dbUserId, selectedRefinementLevel);
      if (!refinementCheck.allowed) {
        const cost = getRefinementCreditCost(selectedRefinementLevel);
        const message = refinementCheck.remainingCredits === 0 
          ? "No Pro credits remaining" 
          : `Need ${cost} credits but only have ${refinementCheck.remainingCredits}`;
        return NextResponse.json(
          { error: message, code: "CREDITS_EXHAUSTED" },
          { status: 402 }
        );
      }
      refinementCreditVersion = refinementCheck.version;
    } else {
      // FREE tier: Check if user wants to use Pro trial
      if (useProTrial) {
        // Check if trial is available
        if (user.proTrialUsed) {
          return NextResponse.json(
            { error: "Pro trial already used. Upgrade to Pro for unlimited access to Gemini 3 Pro.", code: "TRIAL_EXHAUSTED" },
            { status: 402 }
          );
        }
        // User is using their free trial - will use Gemini 3 Pro
        isUsingProMode = true;
        consumeTrial = true;
        // Still need to check regular credits for free tier
        const creditCheck = await checkCredits(dbUserId);
        if (!creditCheck.allowed) {
          return NextResponse.json({ error: "Upgrade to Pro", code: "CREDITS_EXHAUSTED" }, { status: 402 });
        }
        creditVersion = creditCheck.version;
      } else {
        // Normal FREE tier: Use DeepSeek, check regular credits
        const creditCheck = await checkCredits(dbUserId);
        if (!creditCheck.allowed) {
          return NextResponse.json({ error: "Upgrade to Pro", code: "CREDITS_EXHAUSTED" }, { status: 402 });
        }
        creditVersion = creditCheck.version;
      }
    }

    // Lock (use Clerk ID for uniqueness)
    lockAcquired = await acquireGenerationLock(clerkId);
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
    
    // Add conversation history
    for (const msg of messages) {
      aiMessages.push({
        role: msg.role === "assistant" ? "assistant" : "user",
        content: msg.content,
      });
    }
    
    // Add the new prompt if provided
    if (prompt) {
      aiMessages.push({ role: "user", content: prompt });
    }

    // Get refinement passes based on selected level (PRO) or tier (FREE)
    let refinementPasses = 0;
    if (userTier === "PRO" && selectedRefinementLevel) {
      // Map refinement level to number of passes
      switch (selectedRefinementLevel) {
        case "REFINED":
          refinementPasses = 1;
          break;
        case "ENHANCED":
          refinementPasses = 2;
          break;
        case "ULTIMATE":
          refinementPasses = 3; // Keep 3 passes for Ultimate (4 credits)
          break;
      }
    } else {
      refinementPasses = getRefinementPasses(userTier);
    }

    // Select model based on tier (PRO/Trial uses Gemini 3 Pro, FREE uses DeepSeek)
    const selectedModel = isUsingProMode
      ? google("gemini-3-pro-preview") // Gemini 3 Pro Preview - Google's most advanced AI model
      : deepseek("deepseek-chat");
    
    // For Gemini, we use different output token limits
    const maxOutputTokens = isUsingProMode ? 16000 : 8000;

    // Initial generation
    let html = "";
    let currentResult = await generateText({
      model: selectedModel,
      system: DESIGN_SYSTEM_PROMPT + contextPrompt,
      messages: aiMessages,
      temperature: 1.0,
      maxOutputTokens,
      // Set thinking level to "low" for Gemini 3 Pro (minimizes latency and cost)
      ...(isUsingProMode && {
        experimental_providerOptions: {
          google: {
            generationConfig: {
              thinkingConfig: {
                thinkingLevel: "low",
              },
            },
          },
        },
      }),
    });
    html = currentResult.text;

    // Apply refinement passes if user has a refinement tier (PRO only)
    if (refinementPasses > 0) {
      const REFINEMENT_PROMPT = `You are an Elite Design Quality Assurance Engineer. Your task is to review and refine the generated HTML design.

CRITICAL REFINEMENT OBJECTIVES:
1. **Code Quality**: Ensure semantic HTML, proper accessibility attributes, and clean structure
2. **Visual Polish**: Enhance spacing, typography hierarchy, and visual rhythm
3. **Performance**: Optimize animations, ensure efficient CSS, and verify image placeholders
4. **User Experience**: Improve interactivity, ensure mobile responsiveness, and enhance micro-interactions
5. **Design Consistency**: Verify color palette consistency, font pairing harmony, and visual alignment

REFINEMENT PROCESS:
- Analyze the current HTML for areas of improvement
- Make targeted enhancements without changing the core design concept
- Preserve all data-image-query and data-bg-query attributes
- If you find any images with src URLs (especially source.unsplash.com), replace them with data-image-query attributes
- If you find any background-image styles with URLs, replace them with data-bg-query attributes
- ALL images MUST use data-image-query or data-bg-query attributes (NO URLs in src or background-image)
- Ensure all Lucide icons are properly referenced
- Verify scroll animations are smooth and performant
- Check that the design maintains its aesthetic DNA while improving execution

OUTPUT ONLY THE REFINED HTML. No markdown code blocks. No explanations. Start directly with <!DOCTYPE html>.`;

      for (let pass = 1; pass <= refinementPasses; pass++) {
        const refinementMessages: Array<{ role: "user" | "assistant"; content: string }> = [
          {
            role: "user",
            content: `Refinement Pass ${pass} of ${refinementPasses}:\n\nReview and refine this HTML design. Focus on code quality, visual polish, performance optimization, and user experience improvements:\n\n${html}`,
          },
        ];

        // Use the same model for refinement (Gemini for PRO, DeepSeek for FREE)
        currentResult = await generateText({
          model: selectedModel,
          system: REFINEMENT_PROMPT,
          messages: refinementMessages,
          temperature: 1.0,
          maxOutputTokens,
          // Set thinking level to "low" for Gemini 3 Pro (minimizes latency and cost)
          ...(isUsingProMode && {
            experimental_providerOptions: {
              google: {
                generationConfig: {
                  thinkingConfig: {
                    thinkingLevel: "low",
                  },
                },
              },
            },
          }),
        });
        html = currentResult.text;
      }
    }

    // Inject real Unsplash images (replace source.unsplash.com URLs with API URLs)
    // Use our proxy API endpoint which handles caching, rate limiting, and retries
    const baseUrl = new URL(req.url).origin;
    const htmlWithImages = await injectUnsplashImages(html, baseUrl);

    const result = {
      text: htmlWithImages,
      finishReason: currentResult.finishReason,
      usage: currentResult.usage,
    };

    // Charge credits + release lock only after a successful generation.
    if (dbUserId && clerkId) {
      if (userTier === "PRO" && selectedRefinementLevel && typeof refinementCreditVersion === "number") {
        await decrementRefinementCredits(dbUserId, refinementCreditVersion, selectedRefinementLevel).catch(
          console.error
        );
      } else if (typeof creditVersion === "number") {
        await decrementCredits(dbUserId, creditVersion).catch(console.error);
      }
      
      // Mark trial as used if user consumed their free Pro trial
      if (consumeTrial) {
        await db.user.update({
          where: { id: dbUserId },
          data: { proTrialUsed: true },
        }).catch(console.error);
      }
      
      await releaseGenerationLock(clerkId).catch(console.error);
      lockAcquired = false;
    }

    return NextResponse.json({
      html: result.text,
      finishReason: result.finishReason,
      tokenUsage: typeof result.usage?.totalTokens === "number" ? result.usage.totalTokens : undefined,
      usedProTrial: consumeTrial, // Let the client know if trial was consumed
    });

  } catch (error) {
    console.error("Generation error:", error);
    if (clerkId && lockAcquired) {
      await releaseGenerationLock(clerkId);
    }
    return NextResponse.json({ error: "Internal Error", code: "INTERNAL_ERROR" }, { status: 500 });
  }
}
