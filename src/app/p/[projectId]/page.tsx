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
          <Link href="/" className="flex items-center gap-2 font-semibold">
            <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path d="M12 2L3 14h6l-1 6 4-4 4 4-1-6h6L12 2z" />
            </svg>
            AIDesigner
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

