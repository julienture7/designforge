"use client";

import { useState, useCallback } from "react";

/**
 * Viewport configuration for different device sizes
 */
export type ViewportType = 'mobile' | 'tablet' | 'desktop';

export interface ViewportConfig {
  type: ViewportType;
  label: string;
  width: number | '100%';
  height: number | '100%';
}

/**
 * Predefined viewport configurations
 */
export const VIEWPORT_CONFIGS: Record<ViewportType, ViewportConfig> = {
  mobile: {
    type: 'mobile',
    label: 'Mobile',
    width: 375,
    height: 667,
  },
  tablet: {
    type: 'tablet',
    label: 'Tablet',
    width: 768,
    height: 1024,
  },
  desktop: {
    type: 'desktop',
    label: 'Desktop',
    width: '100%',
    height: '100%',
  },
};

/** SVG icons for viewport types */
const ViewportIcons = {
  mobile: (
    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="7" y="2" width="10" height="20" rx="2" />
      <line x1="12" y1="18" x2="12" y2="18.01" strokeWidth="2" />
    </svg>
  ),
  tablet: (
    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="4" y="3" width="16" height="18" rx="2" />
      <line x1="12" y1="17" x2="12" y2="17.01" strokeWidth="2" />
    </svg>
  ),
  desktop: (
    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="3" width="20" height="14" rx="2" />
      <line x1="8" y1="21" x2="16" y2="21" />
      <line x1="12" y1="17" x2="12" y2="21" />
    </svg>
  ),
};

interface ViewportToggleProps {
  selectedViewport: ViewportType;
  onViewportChange: (viewport: ViewportType) => void;
  className?: string;
}

/**
 * ViewportToggle - Modern toggle for switching between device viewports
 */
export function ViewportToggle({ 
  selectedViewport, 
  onViewportChange,
  className = "" 
}: ViewportToggleProps) {
  const viewports: ViewportType[] = ['desktop', 'tablet', 'mobile'];

  return (
    <div className={`viewport-toggle ${className}`}>
      {viewports.map((viewport) => {
        const config = VIEWPORT_CONFIGS[viewport];
        const isSelected = selectedViewport === viewport;
        
        return (
          <button
            key={viewport}
            onClick={() => onViewportChange(viewport)}
            className={`viewport-toggle-btn ${isSelected ? 'viewport-toggle-btn--active' : ''}`}
            title={`${config.label} ${typeof config.width === 'number' ? `(${config.width}×${config.height})` : ''}`}
            aria-pressed={isSelected}
            aria-label={config.label}
          >
            {ViewportIcons[viewport]}
          </button>
        );
      })}
    </div>
  );
}

/**
 * Get CSS styles for iframe container based on viewport type
 * 
 * @param viewport - The selected viewport type
 * @returns CSS style object to apply to the iframe container
 */
export function getViewportStyles(viewport: ViewportType): React.CSSProperties {
  const config = VIEWPORT_CONFIGS[viewport];
  
  if (viewport === 'desktop') {
    return {
      width: '100%',
      height: '100%',
    };
  }
  
  return {
    width: typeof config.width === 'number' ? `${config.width}px` : config.width,
    height: typeof config.height === 'number' ? `${config.height}px` : config.height,
    maxWidth: '100%',
    maxHeight: '100%',
  };
}

/**
 * useViewport - Hook for managing viewport state
 * 
 * @param initialViewport - Initial viewport type (defaults to 'desktop')
 * @returns Object with current viewport, setter, and computed styles
 */
export function useViewport(initialViewport: ViewportType = 'desktop') {
  const [viewport, setViewport] = useState<ViewportType>(initialViewport);

  const handleViewportChange = useCallback((newViewport: ViewportType) => {
    setViewport(newViewport);
  }, []);

  const styles = getViewportStyles(viewport);

  return {
    viewport,
    setViewport: handleViewportChange,
    styles,
    config: VIEWPORT_CONFIGS[viewport],
  };
}

export default ViewportToggle;
