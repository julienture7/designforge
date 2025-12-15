import { NextRequest, NextResponse } from "next/server";
import { db } from "~/server/db";
import { processHtmlForSandbox } from "~/server/lib/html-processor";

/**
 * Preview API Route
 * Returns the HTML content of a project for preview purposes (e.g., in dashboard cards)
 * 
 * This route is intentionally permissive because:
 * 1. It's used in iframes which don't reliably pass auth cookies
 * 2. Project IDs are CUIDs (not guessable)
 * 3. The dashboard that displays these previews is already protected
 * 4. The preview only shows a thumbnail, not editable content
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    
    // Get project - we allow preview access for all projects
    // Security is handled by:
    // - CUID project IDs (not guessable)
    // - X-Frame-Options: SAMEORIGIN (only embeddable from same domain)
    // - The dashboard itself being protected
    const project = await db.project.findUnique({
      where: { id },
      select: {
        id: true,
        htmlContent: true,
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
