import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { 
  ViewportToggle, 
  getViewportStyles, 
  useViewport,
  VIEWPORT_CONFIGS,
  type ViewportType 
} from '@/components/editor/ViewportToggle';
import { renderHook, act } from '@testing-library/react';

describe('ViewportToggle', () => {
  describe('ViewportToggle Component', () => {
    it('renders all three viewport buttons', () => {
      const onViewportChange = vi.fn();
      render(
        <ViewportToggle 
          selectedViewport="desktop" 
          onViewportChange={onViewportChange} 
        />
      );

      expect(screen.getByTitle(/Mobile/)).toBeDefined();
      expect(screen.getByTitle(/Tablet/)).toBeDefined();
      expect(screen.getByTitle(/Desktop/)).toBeDefined();
    });

    it('highlights the selected viewport', () => {
      const onViewportChange = vi.fn();
      render(
        <ViewportToggle 
          selectedViewport="mobile" 
          onViewportChange={onViewportChange} 
        />
      );

      const mobileButton = screen.getByTitle(/Mobile/);
      expect(mobileButton.getAttribute('aria-pressed')).toBe('true');
    });

    it('calls onViewportChange when a button is clicked', () => {
      const onViewportChange = vi.fn();
      render(
        <ViewportToggle 
          selectedViewport="desktop" 
          onViewportChange={onViewportChange} 
        />
      );

      const mobileButton = screen.getByTitle(/Mobile/);
      fireEvent.click(mobileButton);

      expect(onViewportChange).toHaveBeenCalledWith('mobile');
    });

    it('displays correct dimensions in button titles', () => {
      const onViewportChange = vi.fn();
      render(
        <ViewportToggle 
          selectedViewport="desktop" 
          onViewportChange={onViewportChange} 
        />
      );

      expect(screen.getByTitle(/375×667/)).toBeDefined();
      expect(screen.getByTitle(/768×1024/)).toBeDefined();
      expect(screen.getByTitle(/Full width/)).toBeDefined();
    });
  });

  describe('getViewportStyles', () => {
    it('returns correct styles for mobile viewport (375×667)', () => {
      const styles = getViewportStyles('mobile');
      
      expect(styles.width).toBe('375px');
      expect(styles.height).toBe('667px');
    });

    it('returns correct styles for tablet viewport (768×1024)', () => {
      const styles = getViewportStyles('tablet');
      
      expect(styles.width).toBe('768px');
      expect(styles.height).toBe('1024px');
    });

    it('returns 100% for desktop viewport', () => {
      const styles = getViewportStyles('desktop');
      
      expect(styles.width).toBe('100%');
      expect(styles.height).toBe('100%');
    });

    it('includes maxWidth and maxHeight for non-desktop viewports', () => {
      const mobileStyles = getViewportStyles('mobile');
      const tabletStyles = getViewportStyles('tablet');
      
      expect(mobileStyles.maxWidth).toBe('100%');
      expect(mobileStyles.maxHeight).toBe('100%');
      expect(tabletStyles.maxWidth).toBe('100%');
      expect(tabletStyles.maxHeight).toBe('100%');
    });
  });

  describe('useViewport hook', () => {
    it('initializes with default desktop viewport', () => {
      const { result } = renderHook(() => useViewport());
      
      expect(result.current.viewport).toBe('desktop');
      expect(result.current.styles.width).toBe('100%');
    });

    it('initializes with provided viewport', () => {
      const { result } = renderHook(() => useViewport('mobile'));
      
      expect(result.current.viewport).toBe('mobile');
      expect(result.current.styles.width).toBe('375px');
    });

    it('updates viewport when setViewport is called', () => {
      const { result } = renderHook(() => useViewport('desktop'));
      
      act(() => {
        result.current.setViewport('tablet');
      });
      
      expect(result.current.viewport).toBe('tablet');
      expect(result.current.styles.width).toBe('768px');
      expect(result.current.styles.height).toBe('1024px');
    });

    it('returns correct config for current viewport', () => {
      const { result } = renderHook(() => useViewport('mobile'));
      
      expect(result.current.config).toEqual(VIEWPORT_CONFIGS.mobile);
    });
  });

  describe('VIEWPORT_CONFIGS', () => {
    it('has correct mobile configuration', () => {
      expect(VIEWPORT_CONFIGS.mobile).toEqual({
        type: 'mobile',
        label: 'Mobile',
        width: 375,
        height: 667,
        icon: '📱',
      });
    });

    it('has correct tablet configuration', () => {
      expect(VIEWPORT_CONFIGS.tablet).toEqual({
        type: 'tablet',
        label: 'Tablet',
        width: 768,
        height: 1024,
        icon: '📱',
      });
    });

    it('has correct desktop configuration', () => {
      expect(VIEWPORT_CONFIGS.desktop).toEqual({
        type: 'desktop',
        label: 'Desktop',
        width: '100%',
        height: '100%',
        icon: '🖥️',
      });
    });
  });
});
