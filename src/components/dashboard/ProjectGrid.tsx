"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { api } from "~/trpc/react";
import { ProjectCard } from "./ProjectCard";
import { useToastContext } from "~/contexts/ToastContext";

const PAGE_SIZE = 20;

interface ProjectGridProps {
  query?: string;
}

export function ProjectGrid({ query = "" }: ProjectGridProps) {
  const [page, setPage] = useState(1);
  const toast = useToastContext();

  const normalizedQuery = query.trim();

  // Reset pagination when search changes
  useEffect(() => {
    setPage(1);
  }, [normalizedQuery]);

  const { data, isLoading, isError, error } = api.project.list.useQuery({
    page,
    pageSize: PAGE_SIZE,
    query: normalizedQuery.length > 0 ? normalizedQuery : undefined,
  }, {
    // Auto-refresh every 5 seconds if there are generating projects
    refetchInterval: (query) => {
      const projects = query.state.data?.projects ?? [];
      const hasGenerating = projects.some(p => p.status === "GENERATING");
      return hasGenerating ? 5000 : false;
    },
  });

  // Show toast notification when error occurs
  useEffect(() => {
    if (isError && error) {
      toast.error("Failed to load projects", error.message);
    }
  }, [isError, error, toast]);

  if (isLoading) {
    return (
      <div>
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div
              key={i}
              className="rounded-2xl border border-gray-100 bg-white overflow-hidden animate-fade-in-up"
              style={{ animationDelay: `${i * 0.05}s`, animationFillMode: 'both' }}
            >
              <div className="aspect-[4/3] w-full bg-gradient-to-r from-gray-100 via-gray-50 to-gray-100 animate-shimmer" />
              <div className="p-4">
                <div className="h-4 w-3/4 rounded bg-gray-100 mb-2 skeleton-pulse" />
                <div className="h-3 w-1/2 rounded bg-gray-100 skeleton-pulse" style={{ animationDelay: '0.1s' }} />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="animate-fade-in-scale rounded-2xl border border-red-100 bg-red-50 p-12 text-center">
        <p className="text-red-600 font-medium">
          Failed to load projects: {error?.message ?? "Unknown error"}
        </p>
        <button
          onClick={() => window.location.reload()}
          className="mt-4 text-sm text-red-600 underline hover:text-red-800 transition-colors duration-200 hover:scale-105 active:scale-95"
        >
          Try again
        </button>
      </div>
    );
  }

  const { projects, pagination } = data ?? { projects: [], pagination: null };

  if (projects.length === 0) {
    return (
      <div className="animate-fade-in-scale rounded-2xl border border-dashed border-gray-200 bg-gray-50/50 p-12 text-center">
        <div className="mx-auto h-12 w-12 text-gray-400 mb-4 bg-white rounded-xl shadow-sm flex items-center justify-center animate-bounce-subtle">
          <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" /></svg>
        </div>
        <h3 className="text-gray-900 font-medium mb-1">
          {normalizedQuery ? "No matches" : "No projects yet"}
        </h3>
        <p className="text-gray-500 text-sm mb-6">
          {normalizedQuery
            ? "Try a different search term."
            : "Create your first design to get started."}
        </p>
        {!normalizedQuery && (
          <Link
            href="/editor/new"
            className="inline-flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-5 py-2.5 text-sm font-semibold text-gray-900 hover:bg-gray-50 hover:border-gray-300 hover:shadow-md active:scale-95 transition-all duration-200"
          >
            Create New Project
          </Link>
        )}
      </div>
    );
  }

  return (
    <div>
      {/* Project Grid */}
      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {projects.map((project, index) => (
          <ProjectCard
            key={project.id}
            id={project.id}
            title={project.title}
            visibility={project.visibility}
            status={project.status}
            generationCount={project.generationCount}
            updatedAt={project.updatedAt}
            index={index}
          />
        ))}
      </div>

      {/* Pagination */}
      {pagination && pagination.totalPages > 1 && (
        <div className="mt-12 flex items-center justify-center gap-2 animate-fade-in" style={{ animationDelay: '0.3s' }}>
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1}
            className="rounded-lg border border-gray-200 px-3 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50 hover:border-gray-300 hover:shadow-sm active:scale-95 transition-all duration-200 disabled:opacity-50 disabled:hover:shadow-none disabled:hover:border-gray-200"
          >
            Previous
          </button>

          <div className="flex items-center gap-1">
            {Array.from({ length: pagination.totalPages }, (_, i) => i + 1)
              .filter((p) => {
                return (
                  p === 1 ||
                  p === pagination.totalPages ||
                  Math.abs(p - page) <= 1
                );
              })
              .map((p, idx, arr) => {
                const showEllipsisBefore = idx > 0 && p - arr[idx - 1]! > 1;
                return (
                  <span key={p} className="flex items-center">
                    {showEllipsisBefore && (
                      <span className="px-2 text-gray-400">...</span>
                    )}
                    <button
                      onClick={() => setPage(p)}
                      className={`min-w-[2.5rem] rounded-lg px-3 py-2 text-sm font-medium transition-all duration-200 active:scale-95 ${p === page
                          ? "bg-blue-600 text-white shadow-md"
                          : "text-gray-600 hover:bg-gray-50 hover:shadow-sm"
                        }`}
                    >
                      {p}
                    </button>
                  </span>
                );
              })}
          </div>

          <button
            onClick={() => setPage((p) => Math.min(pagination.totalPages, p + 1))}
            disabled={page === pagination.totalPages}
            className="rounded-lg border border-gray-200 px-3 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50 hover:border-gray-300 hover:shadow-sm active:scale-95 transition-all duration-200 disabled:opacity-50 disabled:hover:shadow-none disabled:hover:border-gray-200"
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}
