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
  icon: string;
}

/**
 * Predefined viewport configurations
 * - Mobile: 375×667px (iPhone SE/8 size)
 * - Tablet: 768×1024px (iPad portrait)
 * - Desktop: 100%×100% (full container)
 */
export const VIEWPORT_CONFIGS: Record<ViewportType, ViewportConfig> = {
  mobile: {
    type: 'mobile',
    label: 'Mobile',
    width: 375,
    height: 667,
    icon: '📱',
  },
  tablet: {
    type: 'tablet',
    label: 'Tablet',
    width: 768,
    height: 1024,
    icon: '📱',
  },
  desktop: {
    type: 'desktop',
    label: 'Desktop',
    width: '100%',
    height: '100%',
    icon: '🖥️',
  },
};

interface ViewportToggleProps {
  /** Currently selected viewport */
  selectedViewport: ViewportType;
  /** Callback when viewport changes */
  onViewportChange: (viewport: ViewportType) => void;
  /** Optional className for the container */
  className?: string;
}

/**
 * ViewportToggle - Toggle buttons for switching between device viewport sizes
 * 
 * Provides buttons for Mobile (375×667), Tablet (768×1024), and Desktop (100%)
 * viewport sizes. The selected viewport is highlighted.
 * 
 * Requirements: 4.4
 * DoD: Clicking Mobile button resizes preview to 375×667px
 */
export function ViewportToggle({ 
  selectedViewport, 
  onViewportChange,
  className = "" 
}: ViewportToggleProps) {
  const viewports: ViewportType[] = ['mobile', 'tablet', 'desktop'];

  return (
    <div className={`flex items-center gap-1 bg-surface rounded-lg p-1 ${className}`}>
      {viewports.map((viewport) => {
        const config = VIEWPORT_CONFIGS[viewport];
        const isSelected = selectedViewport === viewport;
        
        return (
          <button
            key={viewport}
            onClick={() => onViewportChange(viewport)}
            className={`
              flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium
              transition-all duration-200 ease-out-expo active:scale-95
              ${isSelected 
                ? 'bg-accent text-accent-foreground shadow-sm' 
                : 'text-muted hover:text-foreground hover:bg-border hover:shadow-sm'
              }
            `}
            title={`${config.label} (${typeof config.width === 'number' ? `${config.width}×${config.height}` : 'Full width'})`}
            aria-pressed={isSelected}
          >
            <span className={`transition-transform duration-200 ${isSelected ? 'scale-110' : ''}`}>{config.icon}</span>
            <span className="hidden sm:inline">{config.label}</span>
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
