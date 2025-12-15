import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { db } from "~/server/db";
import { processHtmlForSandbox } from "~/server/lib/html-processor";

/**
 * Preview API Route
 * Returns the HTML content of a project for preview purposes (e.g., in dashboard cards)
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    
    // Use auth() with optional flag to avoid throwing errors when no user
    // This allows the route to handle authentication internally
    let userId: string | null = null;
    try {
      const authResult = await auth();
      userId = authResult.userId;
    } catch {
      // If auth fails, userId remains null - we'll handle it below
      userId = null;
    }
    
    // Get project first to check visibility
    const project = await db.project.findUnique({
      where: { id },
      select: {
        id: true,
        userId: true,
        htmlContent: true,
        visibility: true,
      },
    });

    if (!project) {
      // Return empty HTML instead of JSON for iframe compatibility
      const emptyHtml = `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>body{margin:0;background:#f3f4f6;}</style></head><body></body></html>`;
      return new NextResponse(emptyHtml, {
        status: 404,
        headers: {
          "Content-Type": "text/html; charset=utf-8",
          "X-Frame-Options": "SAMEORIGIN",
        },
      });
    }

    // Check ownership or public visibility
    // Allow access if: user owns the project OR project is public
    // Note: For dashboard previews, we need to allow the owner to see their own projects
    const isOwner = userId && userId === project.userId;
    const isPublic = project.visibility === "PUBLIC";
    const hasAccess = isOwner || isPublic;
    
    if (!hasAccess) {
      // Return empty HTML instead of JSON for iframe compatibility
      const emptyHtml = `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>body{margin:0;background:#f3f4f6;display:flex;align-items:center;justify-content:center;height:100vh;font-family:system-ui;color:#6b7280;}</style></head><body><div>Private project</div></body></html>`;
      return new NextResponse(emptyHtml, {
        status: 403,
        headers: {
          "Content-Type": "text/html; charset=utf-8",
          "X-Frame-Options": "SAMEORIGIN",
        },
      });
    }

    // Process HTML for sandbox (adds Tailwind, scripts, etc.)
    const processedHtml = processHtmlForSandbox(project.htmlContent);

    // Return as HTML with headers that allow framing
    return new NextResponse(processedHtml, {
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "public, max-age=3600", // Cache for 1 hour
        "X-Frame-Options": "SAMEORIGIN", // Allow framing from same origin
        "Content-Security-Policy": "frame-ancestors 'self'", // Allow framing from same origin
      },
    });
  } catch (error) {
    console.error("Preview API error:", error);
    // Return empty HTML instead of JSON for iframe compatibility
    const errorHtml = `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>body{margin:0;background:#f3f4f6;}</style></head><body></body></html>`;
    return new NextResponse(errorHtml, {
      status: 500,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "X-Frame-Options": "SAMEORIGIN",
      },
    });
  }
}
