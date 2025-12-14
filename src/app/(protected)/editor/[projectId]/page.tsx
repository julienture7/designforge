import { notFound } from "next/navigation";
import { getOrCreateUser } from "~/server/auth";
import { db } from "~/server/db";
import { EditorPageClient } from "~/components/editor/EditorPageClient";
import type { ConversationMessage } from "~/types/editor";

interface EditorPageProps {
  params: Promise<{
    projectId: string;
  }>;
}

/**
 * Editor Page Route
 * 
 * Server component that:
 * - Loads project from database if projectId exists
 * - Initializes chat with conversationHistory and htmlContent from project
 * - On browser refresh: restores state from database, does NOT resume active streams
 * 
 * Requirements: 4.11, 5.3
 * DoD: Navigating to `/editor/new` shows empty editor, `/editor/{id}` loads existing project
 */
export default async function EditorPage({ params }: EditorPageProps) {
  const { projectId } = await params;
  const user = await getOrCreateUser();

  // User should be guaranteed by protected layout, but double-check
  if (!user) {
    notFound();
  }

  // Handle "new" project case
  if (projectId === "new") {
    return (
      <EditorPageClient
        projectId="new"
        initialHistory={[]}
        initialHtml=""
      />
    );
  }

  // Load existing project from database
  try {
    const project = await db.project.findUnique({
      where: {
        id: projectId,
      },
      select: {
        id: true,
        userId: true,
        title: true,
        htmlContent: true,
        conversationHistory: true,
      },
    });

    // Project not found
    if (!project) {
      notFound();
    }

    // Check ownership - user can only access their own projects
    if (project.userId !== user.id) {
      notFound();
    }

    // Parse conversation history from JSON
    // Handle corrupted JSON with empty history fallback (per Requirements 5.8)
    let conversationHistory: ConversationMessage[] = [];
    try {
      const parsed = project.conversationHistory;
      if (Array.isArray(parsed)) {
        // Validate each message has the required structure
        conversationHistory = (parsed as unknown[]).filter(
          (msg): msg is ConversationMessage =>
            typeof msg === "object" &&
            msg !== null &&
            "role" in msg &&
            "content" in msg &&
            (msg.role === "user" || msg.role === "model") &&
            typeof msg.content === "string"
        );
      }
    } catch (parseError) {
      console.warn({
        event: "conversation_history_parse_error",
        projectId: project.id,
        error: parseError instanceof Error ? parseError.message : "Unknown error",
        timestamp: new Date().toISOString(),
      });
      // Continue with empty history - user will see warning in UI
    }

    return (
      <EditorPageClient
        projectId={project.id}
        initialHistory={conversationHistory}
        initialHtml={project.htmlContent}
      />
    );
  } catch (error) {
    console.error({
      event: "project_load_error",
      projectId,
      userId: user.id,
      error: error instanceof Error ? error.message : "Unknown error",
      timestamp: new Date().toISOString(),
    });
    
    // Return 404 for any database errors to avoid exposing internal errors
    notFound();
  }
}

/**
 * Generate metadata for the page
 */
export async function generateMetadata({ params }: EditorPageProps) {
  const { projectId } = await params;
  
  if (projectId === "new") {
    return {
      title: "New Project | Generative UI Platform",
    };
  }

  // For existing projects, we could fetch the title here
  // but for performance, we'll use a generic title
  return {
    title: "Editor | Generative UI Platform",
  };
}
