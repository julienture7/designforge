/**
 * Dashboard Page (Protected)
 * 
 * Displays user's projects with pagination (20 per page) and account information.
 * Shows project cards with title, preview thumbnail, and visibility badge.
 * This route is protected by middleware - requires authentication.
 * Wrapped in error boundary to catch client-side errors.
 * 
 * Requirements: 5.2, 8.9
 * DoD: Dashboard shows user's projects ordered by updatedAt; component crash shows error UI
 */

import { redirect } from "next/navigation";
import { getOrCreateUser } from "~/server/auth";
import { api, HydrateClient } from "~/trpc/server";
import { DashboardContent } from "~/components/dashboard";

export default async function DashboardPage() {
  const user = await getOrCreateUser();

  if (!user) {
    redirect("/sign-in?redirect_url=/dashboard");
  }

  // Prefetch projects for hydration
  void api.project.list.prefetch({ page: 1, pageSize: 20 });

  // Get user stats
  let totalProjects = 0;
  let totalGenerations = 0;
  
  try {
    const projectsData = await api.project.list({ page: 1, pageSize: 1 });
    totalProjects = projectsData.pagination.totalCount;
    
    // Get all projects to sum generations (for stats only)
    if (totalProjects > 0) {
      const allProjects = await api.project.list({ page: 1, pageSize: 100 });
      totalGenerations = allProjects.projects.reduce(
        (sum, p) => sum + p.generationCount,
        0
      );
    }
  } catch {
    // Stats will show 0 if there's an error
  }

  return (
    <HydrateClient>
      <DashboardContent
        userName={user.name}
        userEmail={user.email}
        userTier={user.tier}
        userCredits={user.credits}
        totalProjects={totalProjects}
        totalGenerations={totalGenerations}
      />
    </HydrateClient>
  );
}
