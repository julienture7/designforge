import { auth } from "@clerk/nextjs/server";
import { EditorPageClient } from "~/components/editor/EditorPageClient";

/**
 * Public Editor Page for New Projects
 * 
 * This page serves both anonymous and authenticated users:
 * 
 * Anonymous users can:
 * - Generate websites using Basic mode (free, unlimited)
 * - Edit their generated content (free)
 * - Download HTML or save temporarily (24h)
 * - Sign up to save permanently and access Medium mode
 * 
 * Authenticated users can:
 * - Use Basic mode (free) or Medium mode (with credits)
 * - PRO users can use High mode
 * - Projects are saved automatically
 */
export default async function PublicEditorPage() {
  const { userId } = await auth();

  // Render editor - isAnonymous determines available features
  return (
    <EditorPageClient
      projectId="new"
      initialHistory={[]}
      initialHtml=""
      isAnonymous={!userId}
    />
  );
}

/**
 * Generate metadata for the page
 */
export function generateMetadata() {
  return {
    title: "Create Website | DesignForge",
    description: "Generate beautiful websites instantly with AI. No account required for basic generation.",
  };
}
