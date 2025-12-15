"use client";

import Link from "next/link";
import { useState, useRef, useEffect } from "react";
import { api } from "~/trpc/react";
import { useToastContext } from "~/contexts/ToastContext";

interface ProjectCardProps {
  id: string;
  title: string;
  visibility: "PUBLIC" | "PRIVATE";
  generationCount: number;
  updatedAt: Date;
  index?: number;
}

export function ProjectCard({
  id,
  title,
  visibility,
  generationCount,
  updatedAt,
  index = 0,
}: ProjectCardProps) {
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editedTitle, setEditedTitle] = useState(title);
  const [isSaving, setIsSaving] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement>(null);
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

  // Handle iframe loading with timeout
  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe) return;

    // Timeout after 8 seconds
    const timeout = setTimeout(() => {
      if (isLoading) {
        setIsLoading(false);
        setLoadError(true);
      }
    }, 8000);

    const handleLoad = () => {
      clearTimeout(timeout);
      setIsLoading(false);
      setLoadError(false);
    };

    const handleError = () => {
      clearTimeout(timeout);
      setIsLoading(false);
      setLoadError(true);
    };

    iframe.addEventListener("load", handleLoad);
    iframe.addEventListener("error", handleError);
    
    return () => {
      clearTimeout(timeout);
      iframe.removeEventListener("load", handleLoad);
      iframe.removeEventListener("error", handleError);
    };
  }, [isLoading]);

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
      {/* Preview Thumbnail */}
      <div className="relative aspect-[4/3] w-full overflow-hidden bg-gray-50">
        <iframe
          ref={iframeRef}
          src={`/api/project/${id}/preview`}
          className="absolute inset-0 w-full h-full border-0 transition-transform duration-500 ease-out-expo"
          style={{
            transform: isHovered ? "scale(0.26)" : "scale(0.25)",
            transformOrigin: "top left",
            width: "400%",
            height: "400%",
            pointerEvents: "none",
            opacity: isLoading ? 0 : 1,
            transition: "opacity 0.4s ease-out, transform 0.5s cubic-bezier(0.16, 1, 0.3, 1)",
          }}
          title={`Preview of ${title}`}
          sandbox="allow-scripts"
          loading="lazy"
          aria-hidden="true"
        />
        {/* Loading placeholder */}
        {isLoading && (
          <div className="absolute inset-0 bg-gradient-to-br from-slate-100 via-slate-50 to-white flex items-center justify-center pointer-events-none">
            <div className="flex flex-col items-center gap-2">
              <div className="relative">
                <div className="w-10 h-10 rounded-full border-2 border-slate-200" />
                <div className="absolute inset-0 w-10 h-10 rounded-full border-2 border-t-blue-500 border-r-transparent border-b-transparent border-l-transparent animate-spin" />
              </div>
              <span className="text-xs text-slate-400 font-medium">Loading preview...</span>
            </div>
          </div>
        )}
        
        {/* Error fallback */}
        {loadError && !isLoading && (
          <div className="absolute inset-0 bg-gradient-to-br from-slate-100 to-slate-50 flex items-center justify-center pointer-events-none">
            <div className="flex flex-col items-center gap-2 text-slate-400">
              <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 001.5-1.5V6a1.5 1.5 0 00-1.5-1.5H3.75A1.5 1.5 0 002.25 6v12a1.5 1.5 0 001.5 1.5zm10.5-11.25h.008v.008h-.008V8.25zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" />
              </svg>
              <span className="text-xs font-medium">Preview unavailable</span>
            </div>
          </div>
        )}

        {/* Overlay gradient */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/30 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none z-10" />
        
        {/* Hover action indicator */}
        <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all duration-300 z-20">
          <div className="bg-white/90 backdrop-blur-sm rounded-full px-4 py-2 shadow-lg transform translate-y-2 group-hover:translate-y-0 transition-transform duration-300 ease-out-expo">
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
