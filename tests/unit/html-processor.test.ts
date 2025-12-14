/**
 * Unit tests for HTML Processor Module
 * 
 * Tests the processHtmlForSandbox and extractAestheticDNA functions.
 * 
 * @see Requirements 4.5, 2.6, 9.2
 */

import { describe, it, expect } from 'vitest';
import { processHtmlForSandbox, extractAestheticDNA } from '../../src/server/lib/html-processor';

describe('processHtmlForSandbox', () => {
  it('should inject Tailwind CDN and error handler before </head>', () => {
    const input = '<html><head></head><body></body></html>';
    const result = processHtmlForSandbox(input);
    
    expect(result).toContain('<script src="https://cdn.tailwindcss.com"></script>');
    expect(result).toContain('window.onerror');
    expect(result).toContain('IFRAME_ERROR');
    expect(result).toContain('postMessage');
  });

  it('should handle HTML without </head> tag but with <head>', () => {
    const input = '<html><head><body></body></html>';
    const result = processHtmlForSandbox(input);
    
    expect(result).toContain('<script src="https://cdn.tailwindcss.com"></script>');
    expect(result).toContain('window.onerror');
  });

  it('should handle HTML without any head tag', () => {
    const input = '<html><body>Hello</body></html>';
    const result = processHtmlForSandbox(input);
    
    expect(result).toContain('<script src="https://cdn.tailwindcss.com"></script>');
    expect(result).toContain('window.onerror');
  });

  it('should return empty string for null/undefined input', () => {
    expect(processHtmlForSandbox(null as unknown as string)).toBe('');
    expect(processHtmlForSandbox(undefined as unknown as string)).toBe('');
    expect(processHtmlForSandbox('')).toBe('');
  });

  it('should keep whitelisted scripts (tailwindcss)', () => {
    const input = '<html><head><script src="https://cdn.tailwindcss.com"></script></head><body></body></html>';
    const result = processHtmlForSandbox(input);
    
    // Should contain the original tailwind script plus the injected one
    expect(result.match(/cdn\.tailwindcss\.com/g)?.length).toBeGreaterThanOrEqual(1);
  });

  it('should keep whitelisted scripts (googleapis)', () => {
    const input = '<html><head><script src="https://fonts.googleapis.com/some-font.js"></script></head><body></body></html>';
    const result = processHtmlForSandbox(input);
    
    expect(result).toContain('fonts.googleapis.com');
  });

  it('should keep whitelisted scripts (fontawesome)', () => {
    const input = '<html><head><script src="https://kit.fontawesome.com/abc123.js"></script></head><body></body></html>';
    const result = processHtmlForSandbox(input);
    
    expect(result).toContain('kit.fontawesome.com');
  });

  it('should remove non-whitelisted external scripts', () => {
    const input = '<html><head><script src="https://malicious-site.com/evil.js"></script></head><body></body></html>';
    const result = processHtmlForSandbox(input);
    
    expect(result).not.toContain('malicious-site.com/evil.js">');
    expect(result).toContain('<!-- Removed non-whitelisted script');
  });
});

describe('extractAestheticDNA', () => {
  it('should extract valid AESTHETIC_DNA metadata', () => {
    const html = `
      <html>
      <!-- AESTHETIC_DNA:
      name: Modern Dark
      keywords: dark, modern, sleek
      palette: #1a1a1a, #ffffff, #3b82f6
      typography: Inter, system-ui
      -->
      <head></head>
      <body></body>
      </html>
    `;
    
    const result = extractAestheticDNA(html);
    
    expect(result).not.toBeNull();
    expect(result?.name).toBe('Modern Dark');
    expect(result?.keywords).toEqual(['dark', 'modern', 'sleek']);
    expect(result?.palette).toEqual(['#1a1a1a', '#ffffff', '#3b82f6']);
    expect(result?.typography).toEqual(['Inter', 'system-ui']);
  });

  it('should return null for HTML without AESTHETIC_DNA', () => {
    const html = '<html><head></head><body></body></html>';
    const result = extractAestheticDNA(html);
    
    expect(result).toBeNull();
  });

  it('should return null for null/undefined input', () => {
    expect(extractAestheticDNA(null as unknown as string)).toBeNull();
    expect(extractAestheticDNA(undefined as unknown as string)).toBeNull();
    expect(extractAestheticDNA('')).toBeNull();
  });

  it('should handle partial AESTHETIC_DNA (only name)', () => {
    const html = `
      <!-- AESTHETIC_DNA:
      name: Simple Theme
      -->
    `;
    
    const result = extractAestheticDNA(html);
    
    expect(result).not.toBeNull();
    expect(result?.name).toBe('Simple Theme');
    expect(result?.keywords).toEqual([]);
    expect(result?.palette).toEqual([]);
    expect(result?.typography).toEqual([]);
  });

  it('should return null for empty AESTHETIC_DNA block', () => {
    const html = `<!-- AESTHETIC_DNA: -->`;
    const result = extractAestheticDNA(html);
    
    expect(result).toBeNull();
  });
});
