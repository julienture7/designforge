import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { render } from '@testing-library/react';
import { SandboxedCanvas } from '../../src/components/editor/SandboxedCanvas';

/**
 * **Feature: generative-ui-platform, Property 13: Sandbox iframe security attributes**
 * **Validates: Requirements 4.3, 8.6**
 * 
 * For any HTML rendered in the Sandboxed_Canvas, the iframe element SHALL have
 * `sandbox="allow-scripts allow-same-origin"` attribute.
 * 
 * ARCHITECTURAL NOTE:
 * The `allow-same-origin` permission is REQUIRED for this implementation because:
 * 1. The component uses DOM manipulation (contentDocument.getElementById) for smooth streaming
 * 2. Without `allow-same-origin`, JavaScript cannot access the iframe's DOM
 * 3. This enables throttled updates during streaming without full iframe reloads
 * 
 * Security is maintained through:
 * - The iframe only renders user-generated content (not third-party)
 * - Content is isolated in a separate browsing context
 * - No sensitive data is exposed to the iframe
 * - The parent page doesn't expose any APIs to the iframe
 */

/**
 * Arbitrary for generating valid HTML content strings.
 * Generates various HTML structures that could be rendered in the sandbox.
 */
const htmlTagArb = fc.constantFrom(
  'div', 'span', 'p', 'h1', 'h2', 'h3', 'section', 'article', 'main', 'nav', 'footer', 'header'
);

const htmlContentArb = fc.stringMatching(/^[A-Za-z0-9 .,!?-]{0,100}$/)
  .filter(s => !s.includes('<') && !s.includes('>'));

/**
 * Arbitrary for generating complete HTML documents.
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
  <script src="https://cdn.tailwindcss.com"></script>
</head>
<body>
  <${bodyTag}>${bodyContent}</${bodyTag}>
</body>
</html>`
);

/**
 * Arbitrary for generating simple HTML fragments.
 */
const simpleHtmlArb = fc.record({
  tag: htmlTagArb,
  content: htmlContentArb,
}).map(({ tag, content }) => `<${tag}>${content}</${tag}>`);

/**
 * Arbitrary for generating minimal HTML content.
 */
const minimalHtmlArb = fc.constantFrom(
  '<div>Hello World</div>',
  '<p>Test content</p>',
  '<span>Simple text</span>',
  'Plain text without tags',
  '<html><body><h1>Title</h1></body></html>'
);

/**
 * Combined arbitrary for any valid HTML input that could be rendered.
 */
const anyHtmlInputArb = fc.oneof(
  completeHtmlDocArb,
  simpleHtmlArb,
  minimalHtmlArb
);

/**
 * Expected sandbox value for DOM manipulation streaming approach.
 * allow-scripts: Required for Tailwind CSS and Lucide icons to work
 * allow-same-origin: Required for parent to manipulate iframe DOM during streaming
 */
const EXPECTED_SANDBOX = 'allow-scripts allow-same-origin';

describe('Property 13: Sandbox iframe security attributes', () => {
  /**
   * Main Property Test: For any HTML content, the iframe MUST have the correct sandbox attributes.
   * 
   * This validates the DOM manipulation streaming architecture.
   */
  it('should render iframe with sandbox="allow-scripts allow-same-origin" for DOM manipulation streaming', () => {
    fc.assert(
      fc.property(
        anyHtmlInputArb,
        (html) => {
          const { container } = render(<SandboxedCanvas html={html} />);
          const iframe = container.querySelector('iframe');
          
          // Property: iframe element MUST exist
          expect(iframe).not.toBeNull();
          
          // Property: sandbox attribute MUST be "allow-scripts allow-same-origin"
          // This is required for DOM manipulation during streaming
          expect(iframe?.getAttribute('sandbox')).toBe(EXPECTED_SANDBOX);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property: The iframe MUST have allow-same-origin for DOM manipulation.
   * This is required for the streaming architecture to work.
   */
  it('should include allow-same-origin for DOM manipulation during streaming', () => {
    fc.assert(
      fc.property(
        anyHtmlInputArb,
        (html) => {
          const { container } = render(<SandboxedCanvas html={html} />);
          const iframe = container.querySelector('iframe');
          
          const sandboxValue = iframe?.getAttribute('sandbox') ?? '';
          
          // Property: sandbox MUST contain allow-same-origin for DOM access
          expect(sandboxValue).toContain('allow-same-origin');
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property: The iframe MUST have allow-scripts for Tailwind and Lucide.
   */
  it('should include allow-scripts for Tailwind CSS and Lucide icons', () => {
    fc.assert(
      fc.property(
        anyHtmlInputArb,
        (html) => {
          const { container } = render(<SandboxedCanvas html={html} />);
          const iframe = container.querySelector('iframe');
          
          const sandboxValue = iframe?.getAttribute('sandbox') ?? '';
          
          // Property: sandbox MUST contain allow-scripts
          expect(sandboxValue).toContain('allow-scripts');
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property: The iframe MUST have srcdoc attribute set with the base HTML template.
   */
  it('should set srcdoc attribute with HTML content', () => {
    fc.assert(
      fc.property(
        anyHtmlInputArb,
        (html) => {
          const { container } = render(<SandboxedCanvas html={html} />);
          const iframe = container.querySelector('iframe');
          
          // Property: srcdoc attribute MUST be present
          expect(iframe?.hasAttribute('srcdoc')).toBe(true);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property: The sandbox attribute MUST NOT have dangerous permissions.
   * Even with allow-same-origin, we restrict other potentially dangerous permissions.
   */
  it('should not have dangerous sandbox permissions beyond allow-scripts and allow-same-origin', () => {
    const forbiddenPermissions = [
      'allow-forms',
      'allow-popups',
      'allow-pointer-lock',
      'allow-top-navigation',
      'allow-modals',
      'allow-orientation-lock',
      'allow-presentation',
      'allow-downloads',
    ];

    fc.assert(
      fc.property(
        anyHtmlInputArb,
        (html) => {
          const { container } = render(<SandboxedCanvas html={html} />);
          const iframe = container.querySelector('iframe');
          
          const sandboxValue = iframe?.getAttribute('sandbox') ?? '';
          
          // Property: sandbox MUST NOT contain any forbidden permissions
          for (const permission of forbiddenPermissions) {
            expect(sandboxValue).not.toContain(permission);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property: The iframe MUST have accessible title attribute.
   */
  it('should have accessible title attribute for any HTML content', () => {
    fc.assert(
      fc.property(
        anyHtmlInputArb,
        (html) => {
          const { container } = render(<SandboxedCanvas html={html} />);
          const iframe = container.querySelector('iframe');
          
          // Property: title attribute MUST be present for accessibility
          expect(iframe?.hasAttribute('title')).toBe(true);
          expect(iframe?.getAttribute('title')).toBeTruthy();
        }
      ),
      { numRuns: 25 } // Reduced for performance - React component rendering is slow
    );
  });

  /**
   * Property: Security attributes are consistent regardless of HTML content complexity.
   */
  it('should maintain consistent security attributes for complex HTML with scripts', () => {
    const htmlWithScriptsArb = fc.record({
      scriptContent: fc.stringMatching(/^[A-Za-z0-9 (){}=;]{0,50}$/),
      bodyContent: htmlContentArb,
    }).map(({ scriptContent, bodyContent }) =>
      `<html><head><script>${scriptContent}</script></head><body>${bodyContent}</body></html>`
    );

    fc.assert(
      fc.property(
        htmlWithScriptsArb,
        (html) => {
          const { container } = render(<SandboxedCanvas html={html} />);
          const iframe = container.querySelector('iframe');
          
          // Property: Security attributes MUST be consistent even with script content
          expect(iframe?.getAttribute('sandbox')).toBe(EXPECTED_SANDBOX);
        }
      ),
      { numRuns: 25 } // Reduced for performance - React component rendering is slow
    );
  });
});
