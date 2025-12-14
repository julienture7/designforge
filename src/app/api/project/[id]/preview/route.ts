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
    const { userId } = await auth();
    
    // If no user, return empty placeholder HTML (don't return 401 as it may cause redirects in iframes)
    if (!userId) {
      const placeholderHtml = `
        <!DOCTYPE html>
        <html>
          <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <style>
              body { 
                margin: 0; 
                padding: 0; 
                background: #f3f4f6; 
                display: flex; 
                align-items: center; 
                justify-content: center; 
                height: 100vh; 
                font-family: system-ui, -apple-system, sans-serif;
              }
            </style>
          </head>
          <body></body>
        </html>
      `;
      return new NextResponse(placeholderHtml, {
        headers: {
          "Content-Type": "text/html; charset=utf-8",
          "X-Frame-Options": "SAMEORIGIN",
        },
      });
    }

    // Get project
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
    if (project.userId !== userId && project.visibility !== "PUBLIC") {
      // Return empty HTML instead of JSON for iframe compatibility
      const emptyHtml = `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>body{margin:0;background:#f3f4f6;}</style></head><body></body></html>`;
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
