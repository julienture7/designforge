/**
 * Anonymous Project API
 * 
 * Handles temporary storage for anonymous users' projects.
 * Projects are stored in Redis with 24-hour TTL.
 * Supports MULTIPLE projects per session (up to 5).
 * 
 * When users sign up, their anonymous projects can be migrated
 * to their permanent account.
 * 
 * POST: Save a new temporary project (or update existing by projectId)
 * GET: Retrieve all temporary projects for a session
 * DELETE: Remove a specific project or all projects
 */

import { type NextRequest, NextResponse } from "next/server";
import { redis } from "~/server/lib/redis";
import { checkRateLimit, createRateLimitResponse, getClientIp } from "~/server/lib/rate-limiter";

// 24 hours in seconds
const ANONYMOUS_PROJECT_TTL = 24 * 60 * 60;

// Max storage size per project (500KB) to prevent abuse
const MAX_PROJECT_SIZE = 500 * 1024;

// Max projects per session
const MAX_PROJECTS_PER_SESSION = 5;

interface AnonymousProject {
  projectId: string;
  html: string;
  prompt: string;
  conversationHistory: Array<{ role: string; content: string }>;
  createdAt: string;
  updatedAt: string;
}

interface AnonymousProjectStore {
  sessionId: string;
  projects: AnonymousProject[];
  ip: string;
  updatedAt: string;
}

/**
 * Get Redis key for anonymous projects store
 */
function getProjectKey(sessionId: string): string {
  return `anonymous:projects:${sessionId}`;
}

/**
 * Generate a unique project ID
 */
function generateProjectId(): string {
  return `proj_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

/**
 * POST /api/anonymous-project
 * 
 * Save a new temporary anonymous project or update existing one.
 * If projectId is provided, updates that project. Otherwise creates new.
 * Supports up to MAX_PROJECTS_PER_SESSION projects per session.
 */
export async function POST(req: NextRequest) {
  try {
    // Rate limiting
    const rateLimitResult = await checkRateLimit(req, false);
    if (!rateLimitResult.success) {
      return createRateLimitResponse(rateLimitResult);
    }

    const body = await req.json();
    const { sessionId, projectId, html, prompt, conversationHistory = [] } = body;

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

    // Get existing store or create new
    const existingData = await redis.get<string>(getProjectKey(sessionId));
    let store: AnonymousProjectStore;
    
    if (existingData) {
      store = typeof existingData === "string" ? JSON.parse(existingData) : existingData;
    } else {
      store = {
        sessionId,
        projects: [],
        ip: clientIp,
        updatedAt: now,
      };
    }

    // Deduplicate existing projects first (keep most recent)
    const projectMap = new Map<string, AnonymousProject>();
    for (const project of store.projects) {
      const existing = projectMap.get(project.projectId);
      if (!existing || new Date(project.updatedAt).getTime() > new Date(existing.updatedAt).getTime()) {
        projectMap.set(project.projectId, project);
      }
    }
    store.projects = Array.from(projectMap.values());

    // Check if updating existing project or creating new
    const existingProjectIndex = projectId 
      ? store.projects.findIndex(p => p.projectId === projectId)
      : -1;

    if (existingProjectIndex >= 0) {
      // Update existing project
      store.projects[existingProjectIndex] = {
        ...store.projects[existingProjectIndex],
        html,
        prompt: prompt || store.projects[existingProjectIndex]?.prompt || "",
        conversationHistory,
        updatedAt: now,
      } as AnonymousProject;
    } else {
      // Create new project
      // Check limit
      if (store.projects.length >= MAX_PROJECTS_PER_SESSION) {
        // Remove oldest project to make room (sorted by updatedAt)
        store.projects.sort((a, b) => new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime());
        store.projects.shift();
      }

      const newProject: AnonymousProject = {
        projectId: generateProjectId(),
        html,
        prompt: prompt || "",
        conversationHistory,
        createdAt: now,
        updatedAt: now,
      };
      store.projects.push(newProject);
    }

    store.updatedAt = now;
    store.ip = clientIp;

    // Save to Redis with 24h TTL
    await redis.set(getProjectKey(sessionId), JSON.stringify(store), {
      ex: ANONYMOUS_PROJECT_TTL,
    });

    // Calculate remaining TTL
    const expiresAt = new Date(Date.now() + ANONYMOUS_PROJECT_TTL * 1000).toISOString();

    // Return the project ID (either existing or new)
    const savedProjectId = existingProjectIndex >= 0 
      ? projectId 
      : store.projects[store.projects.length - 1]?.projectId;

    return NextResponse.json({
      success: true,
      sessionId,
      projectId: savedProjectId,
      projectCount: store.projects.length,
      expiresAt,
      message: `Project saved temporarily (${store.projects.length}/${MAX_PROJECTS_PER_SESSION}). Sign up within 24 hours to save permanently.`,
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
 * GET /api/anonymous-project?sessionId=xxx[&projectId=xxx]
 * 
 * Retrieve all temporary anonymous projects for a session,
 * or a specific project if projectId is provided.
 */
export async function GET(req: NextRequest) {
  try {
    // Rate limiting
    const rateLimitResult = await checkRateLimit(req, false);
    if (!rateLimitResult.success) {
      return createRateLimitResponse(rateLimitResult);
    }

    const sessionId = req.nextUrl.searchParams.get("sessionId");
    const projectId = req.nextUrl.searchParams.get("projectId");

    if (!sessionId) {
      return NextResponse.json(
        { error: "Missing sessionId parameter", code: "VALIDATION_ERROR" },
        { status: 400 }
      );
    }

    // Get from Redis
    const storeData = await redis.get<string>(getProjectKey(sessionId));

    if (!storeData) {
      return NextResponse.json(
        { error: "No projects found or expired", code: "NOT_FOUND" },
        { status: 404 }
      );
    }

    // Parse the store data
    const store: AnonymousProjectStore = typeof storeData === "string" 
      ? JSON.parse(storeData) 
      : storeData;

    // Get remaining TTL
    const ttl = await redis.ttl(getProjectKey(sessionId));
    const expiresAt = ttl > 0 
      ? new Date(Date.now() + ttl * 1000).toISOString() 
      : null;

    // If projectId specified, return single project
    if (projectId) {
      const project = store.projects.find(p => p.projectId === projectId);
      if (!project) {
        return NextResponse.json(
          { error: "Project not found", code: "NOT_FOUND" },
          { status: 404 }
        );
      }
      return NextResponse.json({
        success: true,
        project: {
          projectId: project.projectId,
          html: project.html,
          prompt: project.prompt,
          conversationHistory: project.conversationHistory,
          createdAt: project.createdAt,
          updatedAt: project.updatedAt,
        },
        expiresAt,
      });
    }

    // Deduplicate projects by projectId (keep most recent if duplicates exist)
    const projectMap = new Map<string, AnonymousProject>();
    for (const project of store.projects) {
      const existing = projectMap.get(project.projectId);
      if (!existing || new Date(project.updatedAt).getTime() > new Date(existing.updatedAt).getTime()) {
        projectMap.set(project.projectId, project);
      }
    }

    // Return all projects (sorted by updatedAt, newest first)
    const sortedProjects = Array.from(projectMap.values()).sort(
      (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    );

    return NextResponse.json({
      success: true,
      projects: sortedProjects.map(p => ({
        projectId: p.projectId,
        html: p.html,
        prompt: p.prompt,
        conversationHistory: p.conversationHistory,
        createdAt: p.createdAt,
        updatedAt: p.updatedAt,
      })),
      projectCount: sortedProjects.length,
      expiresAt,
    });
  } catch (error) {
    console.error("Anonymous project fetch error:", error);
    return NextResponse.json(
      { error: "Failed to fetch projects", code: "INTERNAL_ERROR" },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/anonymous-project?sessionId=xxx[&projectId=xxx]
 * 
 * Delete a specific project or all projects for a session.
 * If projectId is provided, deletes only that project.
 * Otherwise deletes all projects for the session.
 */
export async function DELETE(req: NextRequest) {
  try {
    // Rate limiting
    const rateLimitResult = await checkRateLimit(req, false);
    if (!rateLimitResult.success) {
      return createRateLimitResponse(rateLimitResult);
    }

    const sessionId = req.nextUrl.searchParams.get("sessionId");
    const projectId = req.nextUrl.searchParams.get("projectId");

    if (!sessionId) {
      return NextResponse.json(
        { error: "Missing sessionId parameter", code: "VALIDATION_ERROR" },
        { status: 400 }
      );
    }

    // If no projectId, delete entire store
    if (!projectId) {
      await redis.del(getProjectKey(sessionId));
      return NextResponse.json({
        success: true,
        message: "All projects deleted",
      });
    }

    // Delete specific project
    const storeData = await redis.get<string>(getProjectKey(sessionId));
    if (!storeData) {
      return NextResponse.json(
        { error: "No projects found", code: "NOT_FOUND" },
        { status: 404 }
      );
    }

    const store: AnonymousProjectStore = typeof storeData === "string" 
      ? JSON.parse(storeData) 
      : storeData;

    const projectIndex = store.projects.findIndex(p => p.projectId === projectId);
    if (projectIndex === -1) {
      return NextResponse.json(
        { error: "Project not found", code: "NOT_FOUND" },
        { status: 404 }
      );
    }

    // Remove the project
    store.projects.splice(projectIndex, 1);
    store.updatedAt = new Date().toISOString();

    // If no projects left, delete the store
    if (store.projects.length === 0) {
      await redis.del(getProjectKey(sessionId));
    } else {
      // Save updated store
      await redis.set(getProjectKey(sessionId), JSON.stringify(store), {
        ex: ANONYMOUS_PROJECT_TTL,
      });
    }

    return NextResponse.json({
      success: true,
      message: "Project deleted",
      remainingCount: store.projects.length,
    });
  } catch (error) {
    console.error("Anonymous project delete error:", error);
    return NextResponse.json(
      { error: "Failed to delete project", code: "INTERNAL_ERROR" },
      { status: 500 }
    );
  }
}

