import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { processHtmlForSandbox } from '../../src/server/lib/html-processor';

/**
 * **Feature: generative-ui-platform, Property 14: HTML injection adds required scripts**
 * **Validates: Requirements 4.5**
 * 
 * For any HTML input, processing for sandbox SHALL result in output containing:
 * 1. Tailwind CDN script: <script src="https://cdn.tailwindcss.com"></script>
 * 2. Error handler script with window.onerror that posts messages to parent
 * 
 * Requirements 4.5 specifies:
 * "WHEN preparing HTML for Sandboxed_Canvas THEN the Editor_Interface SHALL inject
 * the following before </head>:
 * <script src="https://cdn.tailwindcss.com"></script>
 * <script>window.onerror = function(msg, url, line, col, error) {...}</script>"
 */

/**
 * Constants for the required scripts that must be injected
 */
const TAILWIND_CDN_SCRIPT = '<script src="https://cdn.tailwindcss.com"></script>';
const ERROR_HANDLER_SIGNATURE = 'window.onerror';
const POSTMESSAGE_SIGNATURE = 'postMessage';
const IFRAME_ERROR_TYPE = 'IFRAME_ERROR';

/**
 * Arbitrary for generating valid HTML document structures.
 * Generates various HTML structures that the processor should handle.
 */
const htmlTagArb = fc.constantFrom(
  'div', 'span', 'p', 'h1', 'h2', 'h3', 'section', 'article', 'main', 'nav', 'footer', 'header'
);

const htmlContentArb = fc.stringMatching(/^[A-Za-z0-9 .,!?-]{0,100}$/)
  .filter(s => !s.includes('<') && !s.includes('>'));

/**
 * Arbitrary for generating complete HTML documents with head and body.
 */
const completeHtmlDocArb = fc.record({
  title: fc.stringMatching(/^[A-Za-z0-9 -]{1,50}$/),
  bodyContent: htmlContentArb,
  bodyTag: htmlTagArb,
}).map(({ title, bodyContent, bodyTag }) => 
  `<!DOCTYPE html>
<html>
<head>
  <title>${title}</title>
</head>
<body>
  <${bodyTag}>${bodyContent}</${bodyTag}>
</body>
</html>`
);

/**
 * Arbitrary for generating HTML with only head tag (no closing).
 */
const htmlWithHeadOnlyArb = fc.record({
  title: fc.stringMatching(/^[A-Za-z0-9 -]{1,50}$/),
  bodyContent: htmlContentArb,
}).map(({ title, bodyContent }) =>
  `<html><head><title>${title}</title></head><body>${bodyContent}</body></html>`
);

/**
 * Arbitrary for generating HTML without head tag.
 */
const htmlWithoutHeadArb = fc.record({
  bodyContent: htmlContentArb,
  bodyTag: htmlTagArb,
}).map(({ bodyContent, bodyTag }) =>
  `<${bodyTag}>${bodyContent}</${bodyTag}>`
);

/**
 * Arbitrary for generating minimal HTML fragments.
 */
const minimalHtmlArb = fc.constantFrom(
  '<div>Hello</div>',
  '<p>Content</p>',
  '<span>Text</span>',
  'Just plain text',
  '<html><body></body></html>'
);

/**
 * Combined arbitrary for any valid HTML input.
 */
const anyHtmlInputArb = fc.oneof(
  completeHtmlDocArb,
  htmlWithHeadOnlyArb,
  htmlWithoutHeadArb,
  minimalHtmlArb
);

describe('Property 14: HTML injection adds required scripts', () => {
  /**
   * Main Property Test: For any HTML input, processing SHALL add Tailwind CDN script.
   * 
   * This validates Requirements 4.5
   */
  it('should inject Tailwind CDN script into any HTML input', () => {
    fc.assert(
      fc.property(
        anyHtmlInputArb,
        (html) => {
          const result = processHtmlForSandbox(html);
          
          // Property: Output MUST contain Tailwind CDN script
          expect(result).toContain(TAILWIND_CDN_SCRIPT);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property: For any HTML input, processing SHALL add error handler script.
   */
  it('should inject error handler script into any HTML input', () => {
    fc.assert(
      fc.property(
        anyHtmlInputArb,
        (html) => {
          const result = processHtmlForSandbox(html);
          
          // Property: Output MUST contain window.onerror handler
          expect(result).toContain(ERROR_HANDLER_SIGNATURE);
          
          // Property: Error handler MUST use postMessage for cross-frame communication
          expect(result).toContain(POSTMESSAGE_SIGNATURE);
          
          // Property: Error handler MUST emit IFRAME_ERROR type
          expect(result).toContain(IFRAME_ERROR_TYPE);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property: Both required scripts are always present together.
   */
  it('should inject both Tailwind CDN and error handler together', () => {
    fc.assert(
      fc.property(
        anyHtmlInputArb,
        (html) => {
          const result = processHtmlForSandbox(html);
          
          // Property: BOTH scripts MUST be present in output
          const hasTailwind = result.includes(TAILWIND_CDN_SCRIPT);
          const hasErrorHandler = result.includes(ERROR_HANDLER_SIGNATURE);
          
          expect(hasTailwind && hasErrorHandler).toBe(true);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property: Scripts are injected before </head> when head tag exists.
   */
  it('should inject scripts before </head> when head tag exists', () => {
    fc.assert(
      fc.property(
        completeHtmlDocArb,
        (html) => {
          const result = processHtmlForSandbox(html);
          
          const headCloseIndex = result.toLowerCase().indexOf('</head>');
          const tailwindIndex = result.indexOf(TAILWIND_CDN_SCRIPT);
          
          // Property: Scripts MUST appear before </head>
          expect(tailwindIndex).toBeLessThan(headCloseIndex);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property: Processing is idempotent - processing twice produces same result.
   */
  it('should be idempotent - processing twice produces consistent output', () => {
    fc.assert(
      fc.property(
        anyHtmlInputArb,
        (html) => {
          const result1 = processHtmlForSandbox(html);
          const result2 = processHtmlForSandbox(html);
          
          // Property: Same input MUST produce same output
          expect(result1).toBe(result2);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property: Original HTML content is preserved after injection.
   */
  it('should preserve original HTML content after injection', () => {
    fc.assert(
      fc.property(
        fc.record({
          tag: htmlTagArb,
          content: fc.stringMatching(/^[A-Za-z0-9]{1,20}$/),
        }),
        ({ tag, content }) => {
          const originalElement = `<${tag}>${content}</${tag}>`;
          const html = `<html><head></head><body>${originalElement}</body></html>`;
          
          const result = processHtmlForSandbox(html);
          
          // Property: Original content MUST be preserved
          expect(result).toContain(originalElement);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property: Empty or invalid input returns empty string.
   */
  it('should return empty string for empty or invalid input', () => {
    const invalidInputArb = fc.constantFrom(
      '',
      null as unknown as string,
      undefined as unknown as string
    );

    fc.assert(
      fc.property(
        invalidInputArb,
        (input) => {
          const result = processHtmlForSandbox(input);
          
          // Property: Invalid input MUST return empty string
          expect(result).toBe('');
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property: Non-whitelisted external scripts are removed.
   */
  it('should remove non-whitelisted external scripts', () => {
    const maliciousScriptArb = fc.constantFrom(
      'https://evil.com/malware.js',
      'https://attacker.io/steal.js',
      'http://bad-site.net/script.js'
    );

    fc.assert(
      fc.property(
        maliciousScriptArb,
        (scriptSrc) => {
          const html = `<html><head><script src="${scriptSrc}"></script></head><body></body></html>`;
          const result = processHtmlForSandbox(html);
          
          // Property: Non-whitelisted scripts MUST be removed
          expect(result).not.toContain(`src="${scriptSrc}"`);
          
          // Property: Removal comment MUST be present
          expect(result).toContain('Removed non-whitelisted script');
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property: Whitelisted scripts are preserved.
   */
  it('should preserve whitelisted external scripts', () => {
    const whitelistedScriptArb = fc.constantFrom(
      'https://fonts.googleapis.com/css2?family=Inter',
      'https://kit.fontawesome.com/abc123.js',
      'https://cdn.tailwindcss.com'
    );

    fc.assert(
      fc.property(
        whitelistedScriptArb,
        (scriptSrc) => {
          const html = `<html><head><script src="${scriptSrc}"></script></head><body></body></html>`;
          const result = processHtmlForSandbox(html);
          
          // Property: Whitelisted scripts MUST be preserved
          expect(result).toContain(scriptSrc);
        }
      ),
      { numRuns: 100 }
    );
  });
});
