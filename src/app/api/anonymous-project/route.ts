/**
 * Anonymous Project API
 * 
 * Handles temporary storage for anonymous users' projects.
 * Projects are stored in Redis with 24-hour TTL.
 * 
 * When users sign up, their anonymous project can be migrated
 * to their permanent account.
 * 
 * POST: Save/update a temporary project
 * GET: Retrieve a temporary project by session ID
 * DELETE: Remove a temporary project
 */

import { type NextRequest, NextResponse } from "next/server";
import { redis } from "~/server/lib/redis";
import { checkRateLimit, createRateLimitResponse, getClientIp } from "~/server/lib/rate-limiter";

// 24 hours in seconds
const ANONYMOUS_PROJECT_TTL = 24 * 60 * 60;

// Max storage size (500KB) to prevent abuse
const MAX_PROJECT_SIZE = 500 * 1024;

interface AnonymousProject {
  sessionId: string;
  html: string;
  prompt: string;
  conversationHistory: Array<{ role: string; content: string }>;
  createdAt: string;
  updatedAt: string;
  ip: string;
}

/**
 * Get Redis key for anonymous project
 */
function getProjectKey(sessionId: string): string {
  return `anonymous:project:${sessionId}`;
}

/**
 * POST /api/anonymous-project
 * 
 * Save or update a temporary anonymous project
 */
export async function POST(req: NextRequest) {
  try {
    // Rate limiting
    const rateLimitResult = await checkRateLimit(req, false);
    if (!rateLimitResult.success) {
      return createRateLimitResponse(rateLimitResult);
    }

    const body = await req.json();
    const { sessionId, html, prompt, conversationHistory = [] } = body;

    // Validate required fields
    if (!sessionId || typeof sessionId !== "string") {
      return NextResponse.json(
        { error: "Missing or invalid sessionId", code: "VALIDATION_ERROR" },
        { status: 400 }
      );
    }

    if (!html || typeof html !== "string") {
      return NextResponse.json(
        { error: "Missing or invalid html", code: "VALIDATION_ERROR" },
        { status: 400 }
      );
    }

    // Check size limit
    const projectSize = JSON.stringify({ html, prompt, conversationHistory }).length;
    if (projectSize > MAX_PROJECT_SIZE) {
      return NextResponse.json(
        { error: "Project too large. Maximum size is 500KB.", code: "SIZE_LIMIT_EXCEEDED" },
        { status: 413 }
      );
    }

    const clientIp = getClientIp(req);
    const now = new Date().toISOString();

    // Check if project already exists
    const existingProject = await redis.get<AnonymousProject>(getProjectKey(sessionId));

    const project: AnonymousProject = {
      sessionId,
      html,
      prompt: prompt || "",
      conversationHistory,
      createdAt: existingProject?.createdAt || now,
      updatedAt: now,
      ip: clientIp,
    };

    // Save to Redis with 24h TTL
    await redis.set(getProjectKey(sessionId), JSON.stringify(project), {
      ex: ANONYMOUS_PROJECT_TTL,
    });

    // Calculate remaining TTL
    const expiresAt = new Date(Date.now() + ANONYMOUS_PROJECT_TTL * 1000).toISOString();

    return NextResponse.json({
      success: true,
      sessionId,
      expiresAt,
      message: "Project saved temporarily. Sign up within 24 hours to save permanently.",
    });
  } catch (error) {
    console.error("Anonymous project save error:", error);
    return NextResponse.json(
      { error: "Failed to save project", code: "INTERNAL_ERROR" },
      { status: 500 }
    );
  }
}

/**
 * GET /api/anonymous-project?sessionId=xxx
 * 
 * Retrieve a temporary anonymous project
 */
export async function GET(req: NextRequest) {
  try {
    // Rate limiting
    const rateLimitResult = await checkRateLimit(req, false);
    if (!rateLimitResult.success) {
      return createRateLimitResponse(rateLimitResult);
    }

    const sessionId = req.nextUrl.searchParams.get("sessionId");

    if (!sessionId) {
      return NextResponse.json(
        { error: "Missing sessionId parameter", code: "VALIDATION_ERROR" },
        { status: 400 }
      );
    }

    // Get from Redis
    const projectData = await redis.get<string>(getProjectKey(sessionId));

    if (!projectData) {
      return NextResponse.json(
        { error: "Project not found or expired", code: "NOT_FOUND" },
        { status: 404 }
      );
    }

    // Parse the project data
    const project: AnonymousProject = typeof projectData === "string" 
      ? JSON.parse(projectData) 
      : projectData;

    // Get remaining TTL
    const ttl = await redis.ttl(getProjectKey(sessionId));
    const expiresAt = ttl > 0 
      ? new Date(Date.now() + ttl * 1000).toISOString() 
      : null;

    return NextResponse.json({
      success: true,
      project: {
        sessionId: project.sessionId,
        html: project.html,
        prompt: project.prompt,
        conversationHistory: project.conversationHistory,
        createdAt: project.createdAt,
        updatedAt: project.updatedAt,
      },
      expiresAt,
    });
  } catch (error) {
    console.error("Anonymous project fetch error:", error);
    return NextResponse.json(
      { error: "Failed to fetch project", code: "INTERNAL_ERROR" },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/anonymous-project?sessionId=xxx
 * 
 * Delete a temporary anonymous project
 */
export async function DELETE(req: NextRequest) {
  try {
    // Rate limiting
    const rateLimitResult = await checkRateLimit(req, false);
    if (!rateLimitResult.success) {
      return createRateLimitResponse(rateLimitResult);
    }

    const sessionId = req.nextUrl.searchParams.get("sessionId");

    if (!sessionId) {
      return NextResponse.json(
        { error: "Missing sessionId parameter", code: "VALIDATION_ERROR" },
        { status: 400 }
      );
    }

    // Delete from Redis
    await redis.del(getProjectKey(sessionId));

    return NextResponse.json({
      success: true,
      message: "Project deleted",
    });
  } catch (error) {
    console.error("Anonymous project delete error:", error);
    return NextResponse.json(
      { error: "Failed to delete project", code: "INTERNAL_ERROR" },
      { status: 500 }
    );
  }
}

