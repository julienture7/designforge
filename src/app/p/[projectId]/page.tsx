import Link from "next/link";
import { notFound } from "next/navigation";

import { db } from "~/server/db";
import { processHtmlForSandbox } from "~/server/lib/html-processor";

export const dynamic = "force-dynamic";

interface PublishedPageProps {
  params: Promise<{
    projectId: string;
  }>;
}

export default async function PublishedProjectPage({ params }: PublishedPageProps) {
  const { projectId } = await params;

  const project = await db.project.findUnique({
    where: { id: projectId },
    select: {
      title: true,
      htmlContent: true,
      visibility: true,
      updatedAt: true,
    },
  });

  if (!project || project.visibility !== "PUBLIC") {
    notFound();
  }

  const processedHtml = processHtmlForSandbox(project.htmlContent);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border bg-background/80 backdrop-blur">
        <div className="mx-auto max-w-7xl px-6 py-4 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2 group">
            <div className="relative h-7 w-7 flex items-center justify-center">
              <div className="absolute inset-0 rounded-lg bg-gradient-to-br from-indigo-500 via-purple-500 to-pink-500 opacity-90 group-hover:opacity-100 transition-opacity shadow-md shadow-indigo-500/25" />
              <svg className="relative h-4 w-4 text-white" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M6 4h4c4.418 0 8 3.582 8 8s-3.582 8-8 8H6V4z" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
                <path d="M9 12h5" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
              </svg>
            </div>
            <span className="font-semibold tracking-tight bg-gradient-to-r from-gray-900 to-gray-700 bg-clip-text text-transparent">
              DesignForge
            </span>
          </Link>
          <Link href="/sign-up" className="text-sm text-accent hover:underline">
            Create your own
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-6 py-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-lg font-medium">{project.title}</h1>
          <span className="text-xs text-muted">
            Updated {project.updatedAt.toLocaleString()}
          </span>
        </div>

        <div className="mt-4 overflow-hidden rounded-xl border border-border bg-surface">
          <iframe
            title={project.title}
            srcDoc={processedHtml}
            className="h-[80vh] w-full bg-white"
            sandbox="allow-scripts allow-forms allow-popups allow-modals"
          />
        </div>
      </main>
    </div>
  );
}

