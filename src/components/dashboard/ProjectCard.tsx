"use client";

import Link from "next/link";
import { useState, useRef, useEffect } from "react";

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
  const [isHovered, setIsHovered] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  // Hide fallback when iframe loads or handle errors
  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe) return;

    const handleLoad = () => {
      // Check if iframe loaded successfully (not an error page)
      try {
        // If we can access the iframe's location, check it's not the homepage
        const iframeUrl = iframe.contentWindow?.location.href;
        if (iframeUrl && iframeUrl.includes('/api/project/')) {
          setIsLoading(false);
        } else {
          // Iframe redirected - keep showing placeholder
          console.warn("Preview iframe redirected to:", iframeUrl);
        }
      } catch (e) {
        // Cross-origin or other error - assume it loaded if we get here
        setIsLoading(false);
      }
    };

    const handleError = () => {
      console.error("Preview iframe failed to load");
      setIsLoading(false); // Hide loading state even on error
    };

    iframe.addEventListener("load", handleLoad);
    iframe.addEventListener("error", handleError);
    return () => {
      iframe.removeEventListener("load", handleLoad);
      iframe.removeEventListener("error", handleError);
    };
  }, []);

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

  return (
    <Link
      href={`/editor/${id}`}
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
        {/* Fallback placeholder - shown while iframe loads */}
        {isLoading && (
          <div className="absolute inset-0 bg-gradient-to-br from-gray-100 to-gray-50 flex items-center justify-center pointer-events-none">
            <div className="text-gray-300 animate-pulse">
              <svg className="w-12 h-12" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
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
        <h3 className="truncate text-base font-semibold text-gray-900 group-hover:text-blue-600 transition-colors duration-200">
          {title}
        </h3>
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
