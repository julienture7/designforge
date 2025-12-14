import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { sanitizePrompt, hasInjectionPattern } from '../../src/server/lib/sanitization';

/**
 * **Feature: generative-ui-platform, Property 9: Prompt injection patterns are escaped**
 * **Validates: Requirements 2.18**
 * 
 * For any prompt containing injection patterns (e.g., "ignore previous instructions",
 * "system:", XML tags), the sanitized output SHALL wrap the pattern in triple
 * backticks with `[USER INPUT]:` prefix.
 * 
 * Requirements 2.18 specifies:
 * "WHEN processing user prompts THEN the Sanitization_Layer SHALL detect injection
 * patterns via regex: `/ignore\s+(all\s+)?previous|system\s*:|assistant\s*:|<\/?system>|<\/?prompt>/gi`
 * and wrap detected content in triple backticks with `[USER INPUT]:` prefix"
 */

/**
 * Arbitrary for generating injection patterns that MUST be escaped.
 * These patterns match the regex defined in Requirements 2.18:
 * /ignore\s+(all\s+)?previous|system\s*:|assistant\s*:|<\/?system>|<\/?prompt>/gi
 */
const injectionPatternArb = fc.oneof(
  // "ignore previous" variants
  fc.constant('ignore previous'),
  fc.constant('ignore  previous'),  // multiple spaces
  fc.constant('IGNORE PREVIOUS'),   // uppercase
  fc.constant('Ignore Previous'),   // mixed case
  
  // "ignore all previous" variants
  fc.constant('ignore all previous'),
  fc.constant('ignore  all  previous'),  // multiple spaces
  fc.constant('IGNORE ALL PREVIOUS'),    // uppercase
  fc.constant('Ignore All Previous'),    // mixed case
  
  // "system:" variants
  fc.constant('system:'),
  fc.constant('system :'),   // space before colon
  fc.constant('SYSTEM:'),    // uppercase
  fc.constant('System:'),    // mixed case
  
  // "assistant:" variants
  fc.constant('assistant:'),
  fc.constant('assistant :'),  // space before colon
  fc.constant('ASSISTANT:'),   // uppercase
  fc.constant('Assistant:'),   // mixed case
  
  // XML-style system tags
  fc.constant('<system>'),
  fc.constant('</system>'),
  fc.constant('<SYSTEM>'),
  fc.constant('</SYSTEM>'),
  
  // XML-style prompt tags
  fc.constant('<prompt>'),
  fc.constant('</prompt>'),
  fc.constant('<PROMPT>'),
  fc.constant('</PROMPT>')
);

/**
 * Arbitrary for generating safe text that should NOT be escaped.
 * This represents normal user prompts without injection patterns.
 */
const safeTextArb = fc.stringMatching(/^[A-Za-z0-9 ,.!?'-]{1,50}$/)
  .filter(s => !hasInjectionPattern(s));

/**
 * Arbitrary for generating prompts that contain injection patterns
 * embedded within normal text.
 */
const promptWithInjectionArb = fc.tuple(
  safeTextArb,
  injectionPatternArb,
  safeTextArb
).map(([prefix, injection, suffix]) => ({
  fullPrompt: `${prefix} ${injection} ${suffix}`,
  injectionPattern: injection
}));

describe('Property 9: Prompt injection patterns are escaped', () => {
  /**
   * Main Property Test: For any injection pattern, sanitization SHALL wrap it
   * in triple backticks with [USER INPUT]: prefix.
   * 
   * This validates Requirements 2.18
   */
  it('should escape any injection pattern with [USER INPUT]: prefix and triple backticks', () => {
    fc.assert(
      fc.property(
        injectionPatternArb,
        (injectionPattern) => {
          const sanitized = sanitizePrompt(injectionPattern);
          
          // Property: The sanitized output MUST contain the escape wrapper
          expect(sanitized).toContain('[USER INPUT]:');
          expect(sanitized).toContain('```');
          
          // Property: The original injection pattern should NOT appear unescaped
          // (it should be wrapped in backticks)
          const escapedPattern = `[USER INPUT]: \`\`\``;
          expect(sanitized).toContain(escapedPattern);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property: For any prompt containing an injection pattern embedded in text,
   * the injection pattern SHALL be escaped while preserving surrounding text.
   */
  it('should escape injection patterns while preserving surrounding safe text', () => {
    fc.assert(
      fc.property(
        promptWithInjectionArb,
        ({ fullPrompt }) => {
          const sanitized = sanitizePrompt(fullPrompt);
          
          // Property: Sanitized output MUST contain escape markers
          expect(sanitized).toContain('[USER INPUT]:');
          expect(sanitized).toContain('```');
          
          // Property: The sanitized output should be different from input
          // (since it contains an injection pattern)
          expect(sanitized).not.toBe(fullPrompt);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property: For any safe prompt (no injection patterns), sanitization
   * SHALL return the prompt unchanged.
   */
  it('should not modify safe prompts without injection patterns', () => {
    fc.assert(
      fc.property(
        safeTextArb,
        (safePrompt) => {
          const sanitized = sanitizePrompt(safePrompt);
          
          // Property: Safe prompts MUST remain unchanged
          expect(sanitized).toBe(safePrompt);
          
          // Property: Safe prompts should NOT contain escape markers
          expect(sanitized).not.toContain('[USER INPUT]:');
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property: hasInjectionPattern detection is consistent with sanitization.
   * If hasInjectionPattern returns true, sanitization MUST modify the prompt.
   */
  it('should have consistent detection and sanitization behavior', () => {
    fc.assert(
      fc.property(
        injectionPatternArb,
        (injectionPattern) => {
          const hasPattern = hasInjectionPattern(injectionPattern);
          const sanitized = sanitizePrompt(injectionPattern);
          
          // Property: If pattern is detected, sanitization MUST modify the input
          if (hasPattern) {
            expect(sanitized).not.toBe(injectionPattern);
            expect(sanitized).toContain('[USER INPUT]:');
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property: Multiple injection patterns in a single prompt SHALL all be escaped.
   */
  it('should escape all injection patterns when multiple are present', () => {
    const multipleInjectionArb = fc.tuple(
      injectionPatternArb,
      safeTextArb,
      injectionPatternArb
    ).map(([first, middle, second]) => `${first} ${middle} ${second}`);

    fc.assert(
      fc.property(
        multipleInjectionArb,
        (promptWithMultiple) => {
          const sanitized = sanitizePrompt(promptWithMultiple);
          
          // Property: All injection patterns should be escaped
          // Count occurrences of escape markers - should be at least 2
          const escapeCount = (sanitized.match(/\[USER INPUT\]:/g) || []).length;
          expect(escapeCount).toBeGreaterThanOrEqual(2);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property: Sanitization is idempotent for safe prompts.
   * Applying sanitization twice to a safe prompt yields the same result.
   */
  it('should be idempotent for safe prompts', () => {
    fc.assert(
      fc.property(
        safeTextArb,
        (safePrompt) => {
          const once = sanitizePrompt(safePrompt);
          const twice = sanitizePrompt(once);
          
          // Property: Sanitizing a safe prompt twice should yield same result
          expect(twice).toBe(once);
        }
      ),
      { numRuns: 100 }
    );
  });
});
