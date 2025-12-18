/**
 * POST /api/anonymous-project/migrate
 * 
 * Migrates an anonymous project to the authenticated user's account.
 * Called after a user signs up to preserve their work.
 */

import { type NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { redis } from "~/server/lib/redis";
import { db } from "~/server/db";
import { getOrCreateUser } from "~/server/auth";

interface AnonymousProject {
  sessionId: string;
  html: string;
  prompt: string;
  conversationHistory: Array<{ role: string; content: string }>;
  createdAt: string;
  updatedAt: string;
  ip: string;
}

function getProjectKey(sessionId: string): string {
  return `anonymous:project:${sessionId}`;
}

export async function POST(req: NextRequest) {
  try {
    // Require authentication
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json(
        { error: "Unauthorized", code: "UNAUTHORIZED" },
        { status: 401 }
      );
    }

    // Get or create user in database
    const user = await getOrCreateUser();
    if (!user) {
      return NextResponse.json(
        { error: "User not found", code: "USER_NOT_FOUND" },
        { status: 404 }
      );
    }

    // Get session ID from request body
    const body = await req.json();
    const { sessionId } = body;

    if (!sessionId || typeof sessionId !== "string") {
      return NextResponse.json(
        { error: "Missing sessionId", code: "VALIDATION_ERROR" },
        { status: 400 }
      );
    }

    // Get anonymous project from Redis
    const projectData = await redis.get<string>(getProjectKey(sessionId));
    if (!projectData) {
      return NextResponse.json(
        { error: "Anonymous project not found or expired", code: "NOT_FOUND" },
        { status: 404 }
      );
    }

    // Parse the project data
    const anonProject: AnonymousProject = typeof projectData === "string" 
      ? JSON.parse(projectData) 
      : projectData;

    // Extract title from prompt (first 50 chars or use default)
    const title = anonProject.prompt 
      ? anonProject.prompt.slice(0, 50) + (anonProject.prompt.length > 50 ? "..." : "")
      : "Imported Project";

    // Convert conversation history to the expected format
    const conversationHistory = anonProject.conversationHistory.map(msg => ({
      role: msg.role === "assistant" || msg.role === "model" ? "model" : "user",
      content: msg.content,
    }));

    // Create project in database
    const project = await db.project.create({
      data: {
        userId: user.id,
        title,
        htmlContent: anonProject.html,
        conversationHistory: conversationHistory,
        status: "READY",
        visibility: "PUBLIC", // Default to public for free users
        generationCount: 1,
      },
    });

    // Delete the anonymous project from Redis (successfully migrated)
    await redis.del(getProjectKey(sessionId));

    console.log({
      event: "anonymous_project_migrated",
      sessionId,
      userId: user.id,
      projectId: project.id,
    });

    return NextResponse.json({
      success: true,
      projectId: project.id,
      message: "Project migrated successfully",
    });
  } catch (error) {
    console.error("Anonymous project migration error:", error);
    return NextResponse.json(
      { error: "Failed to migrate project", code: "INTERNAL_ERROR" },
      { status: 500 }
    );
  }
}

