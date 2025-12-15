"use client";

import Link from "next/link";
import { useState, useRef, useEffect } from "react";
import { api } from "~/trpc/react";
import { useToastContext } from "~/contexts/ToastContext";

interface ProjectCardProps {
  id: string;
  title: string;
  visibility: "PUBLIC" | "PRIVATE";
  status?: "GENERATING" | "READY";
  generationCount: number;
  updatedAt: Date;
  index?: number;
}

export function ProjectCard({
  id,
  title,
  visibility,
  status = "READY",
  generationCount,
  updatedAt,
  index = 0,
}: ProjectCardProps) {
  const isGenerating = status === "GENERATING";
  const [isHovered, setIsHovered] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editedTitle, setEditedTitle] = useState(title);
  const [isSaving, setIsSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const toast = useToastContext();
  
  const utils = api.useUtils();
  const updateMutation = api.project.update.useMutation({
    onSuccess: () => {
      setIsEditing(false);
      setIsSaving(false);
      toast.success("Project title updated");
      void utils.project.list.invalidate();
    },
    onError: (error) => {
      setIsSaving(false);
      toast.error("Failed to update title", error.message);
      setEditedTitle(title);
    },
  });

  // Sync editedTitle when title prop changes
  useEffect(() => {
    if (!isEditing) {
      setEditedTitle(title);
    }
  }, [title, isEditing]);

  // Focus input when entering edit mode
  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  // Relative time formatter (e.g. "Edited about 1 hour ago")
  const getRelativeTime = (date: Date) => {
    const diff = Date.now() - date.getTime();
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) return `Edited ${days} day${days > 1 ? 's' : ''} ago`;
    if (hours > 0) return `Edited about ${hours} hour${hours > 1 ? 's' : ''} ago`;
    if (minutes > 0) return `Edited ${minutes} minute${minutes > 1 ? 's' : ''} ago`;
    return 'Edited just now';
  };

  const handleEditClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsEditing(true);
    setEditedTitle(title);
  };

  const handleSave = () => {
    const trimmedTitle = editedTitle.trim();
    if (!trimmedTitle) {
      toast.error("Title cannot be empty");
      setEditedTitle(title);
      setIsEditing(false);
      return;
    }
    
    if (trimmedTitle === title) {
      setIsEditing(false);
      return;
    }

    setIsSaving(true);
    updateMutation.mutate({
      id,
      title: trimmedTitle,
    });
  };

  const handleCancel = () => {
    setEditedTitle(title);
    setIsEditing(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleSave();
    } else if (e.key === "Escape") {
      e.preventDefault();
      handleCancel();
    }
  };

  const handleLinkClick = (e: React.MouseEvent) => {
    if (isEditing) {
      e.preventDefault();
      e.stopPropagation();
    }
  };

  return (
    <Link
      href={`/editor/${id}`}
      onClick={handleLinkClick}
      className="group block rounded-xl overflow-hidden bg-white border border-gray-100 transition-all duration-300 ease-out hover:shadow-2xl hover:-translate-y-1 hover:border-gray-200 active:scale-[0.98] active:shadow-lg animate-fade-in-up"
      style={{ animationDelay: `${index * 0.05}s`, animationFillMode: 'both' }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* Preview Thumbnail - Simple gradient design (no iframe for reliability) */}
      <div className="relative aspect-[4/3] w-full overflow-hidden bg-gradient-to-br from-slate-50 via-white to-slate-100">
        {/* Decorative design elements */}
        <div className="absolute inset-0 p-4">
          {/* Mock browser chrome */}
          <div className="h-full w-full rounded-lg border border-slate-200/60 bg-white shadow-sm overflow-hidden">
            {/* Browser header */}
            <div className="h-6 bg-slate-50 border-b border-slate-100 flex items-center px-2 gap-1.5">
              <div className="w-2 h-2 rounded-full bg-red-300" />
              <div className="w-2 h-2 rounded-full bg-yellow-300" />
              <div className="w-2 h-2 rounded-full bg-green-300" />
              <div className="flex-1 mx-2">
                <div className="h-3 bg-slate-100 rounded-full w-3/4" />
              </div>
            </div>
            {/* Mock content */}
            <div className="p-3 space-y-2">
              {/* Hero section mock */}
              <div className="h-8 bg-gradient-to-r from-indigo-100 to-purple-100 rounded" />
              <div className="space-y-1">
                <div className="h-2 bg-slate-100 rounded w-3/4" />
                <div className="h-2 bg-slate-100 rounded w-1/2" />
              </div>
              {/* Cards mock */}
              <div className="flex gap-2 mt-3">
                <div className="flex-1 h-10 bg-slate-50 rounded border border-slate-100" />
                <div className="flex-1 h-10 bg-slate-50 rounded border border-slate-100" />
              </div>
            </div>
          </div>
        </div>

        {/* Generating indicator - shown when project is being generated */}
        {isGenerating && (
          <div className="absolute inset-0 bg-gradient-to-br from-indigo-50/95 via-purple-50/95 to-pink-50/95 flex items-center justify-center z-30">
            <div className="flex flex-col items-center gap-3">
              <div className="relative">
                <div className="w-12 h-12 rounded-full bg-gradient-to-br from-indigo-500 via-purple-500 to-pink-500 opacity-20 animate-ping" />
                <div className="absolute inset-0 flex items-center justify-center">
                  <svg className="w-6 h-6 text-indigo-600 animate-pulse" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                </div>
              </div>
              <span className="text-sm font-medium text-indigo-600">Generating...</span>
            </div>
          </div>
        )}

        {/* Overlay gradient on hover */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/20 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none z-10" />
        
        {/* Hover action indicator */}
        <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all duration-300 z-20">
          <div className="bg-white/95 backdrop-blur-sm rounded-full px-4 py-2 shadow-lg transform translate-y-2 group-hover:translate-y-0 transition-transform duration-300 ease-out-expo">
            <span className="text-sm font-medium text-gray-900 flex items-center gap-2">
              Open Editor
              <svg className="w-4 h-4 transition-transform duration-200 group-hover:translate-x-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </span>
          </div>
        </div>
      </div>

      {/* Card Content */}
      <div className="p-4 bg-white transition-colors duration-200 group-hover:bg-gray-50/50">
        <div className="flex items-center gap-2 group/title">
          {isEditing ? (
            <input
              ref={inputRef}
              type="text"
              value={editedTitle}
              onChange={(e) => setEditedTitle(e.target.value)}
              onClick={(e) => {
                e.stopPropagation();
                e.preventDefault();
              }}
              onBlur={handleSave}
              onKeyDown={handleKeyDown}
              disabled={isSaving}
              className="flex-1 text-base font-semibold text-gray-900 bg-white border border-blue-300 rounded px-2 py-1 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:opacity-50"
              maxLength={200}
            />
          ) : (
            <>
              <h3 className="flex-1 truncate text-base font-semibold text-gray-900 group-hover:text-blue-600 transition-colors duration-200">
                {title}
              </h3>
              <button
                onClick={handleEditClick}
                className="opacity-0 group-hover/title:opacity-100 transition-opacity duration-200 p-1 rounded hover:bg-gray-200 active:scale-95 flex-shrink-0"
                title="Edit title"
                aria-label="Edit project title"
              >
                <svg
                  className="w-4 h-4 text-gray-500 hover:text-blue-600 transition-colors"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                  />
                </svg>
              </button>
            </>
          )}
        </div>
        <p className="mt-1 text-xs text-gray-500 font-medium transition-colors duration-200 group-hover:text-gray-600">
          {getRelativeTime(new Date(updatedAt))}
        </p>

        <div className="mt-4 flex items-center justify-between">
          <div className="flex -space-x-2">
            <div className="w-6 h-6 rounded-full bg-blue-100 border-2 border-white flex items-center justify-center text-[10px] font-bold text-blue-600 transition-transform duration-200 group-hover:scale-110">
              U
            </div>
          </div>
          
          {/* Generation count badge */}
          <div className="flex items-center gap-1 text-xs text-gray-400 transition-colors duration-200 group-hover:text-gray-500">
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
            <span>{generationCount}</span>
          </div>
        </div>
      </div>
    </Link>
  );
}
