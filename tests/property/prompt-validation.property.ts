import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { generateInputSchema } from '../../src/lib/validators/generate';

/**
 * **Feature: generative-ui-platform, Property 8: Prompt validation rejects invalid input**
 * **Validates: Requirements 2.16**
 * 
 * For any prompt that is empty, whitespace-only, or exceeds 10,000 characters,
 * the generation endpoint SHALL return HTTP 400 with appropriate error code
 * (`EMPTY_PROMPT` or `PROMPT_TOO_LONG`).
 * 
 * Requirements 2.16 specifies:
 * "IF the prompt fails Zod validation (empty or >10,000 chars) THEN the
 * Generation_Engine SHALL return `EMPTY_PROMPT` or `PROMPT_TOO_LONG` error
 * immediately without API call"
 */

/**
 * Helper to determine expected error code based on prompt validation failure
 */
function getExpectedErrorCode(prompt: string): 'EMPTY_PROMPT' | 'PROMPT_TOO_LONG' | null {
  const trimmed = prompt.trim();
  if (trimmed.length === 0) {
    return 'EMPTY_PROMPT';
  }
  if (trimmed.length > 10000) {
    return 'PROMPT_TOO_LONG';
  }
  return null;
}

/**
 * Arbitrary for generating empty prompts (empty string or whitespace-only)
 */
const emptyPromptArb = fc.oneof(
  // Empty string
  fc.constant(''),
  // Single whitespace characters
  fc.constant(' '),
  fc.constant('\t'),
  fc.constant('\n'),
  fc.constant('\r'),
  fc.constant('\r\n'),
  // Multiple whitespace characters - use array and join
  fc.array(fc.constantFrom(' ', '\t', '\n', '\r'), { minLength: 1, maxLength: 100 })
    .map(arr => arr.join(''))
);

/**
 * Arbitrary for generating prompts that exceed 10,000 characters
 * After trimming, the prompt must still exceed 10,000 characters
 */
const tooLongPromptArb = fc.string({ minLength: 10001, maxLength: 15000 })
  .filter(s => s.trim().length > 10000);

/**
 * Arbitrary for generating valid prompts (1-10,000 characters after trimming)
 */
const validPromptArb = fc.string({ minLength: 1, maxLength: 10000 })
  .filter(s => {
    const trimmed = s.trim();
    return trimmed.length >= 1 && trimmed.length <= 10000;
  });

describe('Property 8: Prompt validation rejects invalid input', () => {
  /**
   * Property: For any empty or whitespace-only prompt, validation SHALL fail
   * with an error indicating the prompt cannot be empty.
   */
  it('should reject empty prompts with validation error', () => {
    fc.assert(
      fc.property(
        emptyPromptArb,
        (emptyPrompt) => {
          const result = generateInputSchema.safeParse({
            prompt: emptyPrompt,
            conversationHistory: [],
          });

          // Property: Empty prompts MUST fail validation
          expect(result.success).toBe(false);

          if (!result.success) {
            // Property: Error should be related to prompt field
            const promptError = result.error.errors.find(e => e.path.includes('prompt'));
            expect(promptError).toBeDefined();
            
            // Property: Error message should indicate prompt cannot be empty
            expect(promptError?.message).toContain('empty');
          }

          // Property: Expected error code should be EMPTY_PROMPT
          const expectedCode = getExpectedErrorCode(emptyPrompt);
          expect(expectedCode).toBe('EMPTY_PROMPT');
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property: For any prompt exceeding 10,000 characters, validation SHALL fail
   * with an error indicating the prompt is too long.
   */
  it('should reject prompts exceeding 10,000 characters with validation error', () => {
    fc.assert(
      fc.property(
        tooLongPromptArb,
        (longPrompt) => {
          const result = generateInputSchema.safeParse({
            prompt: longPrompt,
            conversationHistory: [],
          });

          // Property: Too long prompts MUST fail validation
          expect(result.success).toBe(false);

          if (!result.success) {
            // Property: Error should be related to prompt field
            const promptError = result.error.errors.find(e => e.path.includes('prompt'));
            expect(promptError).toBeDefined();
            
            // Property: Error message should indicate prompt exceeds maximum length
            expect(promptError?.message).toContain('10,000');
          }

          // Property: Expected error code should be PROMPT_TOO_LONG
          const expectedCode = getExpectedErrorCode(longPrompt);
          expect(expectedCode).toBe('PROMPT_TOO_LONG');
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property: For any valid prompt (1-10,000 characters after trimming),
   * validation SHALL succeed.
   */
  it('should accept valid prompts within length limits', () => {
    fc.assert(
      fc.property(
        validPromptArb,
        (validPrompt) => {
          const result = generateInputSchema.safeParse({
            prompt: validPrompt,
            conversationHistory: [],
          });

          // Property: Valid prompts MUST pass validation
          expect(result.success).toBe(true);

          if (result.success) {
            // Property: Parsed prompt should be trimmed
            expect(result.data.prompt).toBe(validPrompt.trim());
          }

          // Property: No error code expected for valid prompts
          const expectedCode = getExpectedErrorCode(validPrompt);
          expect(expectedCode).toBeNull();
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property: Prompts at exactly 10,000 characters (boundary) SHALL be accepted.
   */
  it('should accept prompts at exactly 10,000 characters boundary', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 9990, max: 10000 }),
        (length) => {
          // Generate a prompt of exact length
          const boundaryPrompt = 'a'.repeat(length);
          
          const result = generateInputSchema.safeParse({
            prompt: boundaryPrompt,
            conversationHistory: [],
          });

          // Property: Prompts at or below 10,000 chars MUST pass validation
          expect(result.success).toBe(true);

          if (result.success) {
            expect(result.data.prompt.length).toBe(length);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property: Prompts at exactly 10,001 characters (boundary) SHALL be rejected.
   */
  it('should reject prompts at exactly 10,001 characters boundary', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 10001, max: 10010 }),
        (length) => {
          // Generate a prompt of exact length
          const boundaryPrompt = 'a'.repeat(length);
          
          const result = generateInputSchema.safeParse({
            prompt: boundaryPrompt,
            conversationHistory: [],
          });

          // Property: Prompts above 10,000 chars MUST fail validation
          expect(result.success).toBe(false);

          if (!result.success) {
            const promptError = result.error.errors.find(e => e.path.includes('prompt'));
            expect(promptError).toBeDefined();
            expect(promptError?.message).toContain('10,000');
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property: Prompts with leading/trailing whitespace that become empty after
   * trimming SHALL be rejected as empty.
   */
  it('should reject prompts that become empty after trimming', () => {
    const whitespaceWrappedEmptyArb = fc.tuple(
      fc.array(fc.constantFrom(' ', '\t', '\n'), { minLength: 1, maxLength: 10 }).map(arr => arr.join('')),
      fc.array(fc.constantFrom(' ', '\t', '\n'), { minLength: 1, maxLength: 10 }).map(arr => arr.join(''))
    ).map(([prefix, suffix]) => prefix + suffix);

    fc.assert(
      fc.property(
        whitespaceWrappedEmptyArb,
        (whitespacePrompt) => {
          const result = generateInputSchema.safeParse({
            prompt: whitespacePrompt,
            conversationHistory: [],
          });

          // Property: Whitespace-only prompts MUST fail validation
          expect(result.success).toBe(false);

          if (!result.success) {
            const promptError = result.error.errors.find(e => e.path.includes('prompt'));
            expect(promptError).toBeDefined();
            expect(promptError?.message).toContain('empty');
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property: Prompts with leading/trailing whitespace that are valid after
   * trimming SHALL be accepted with trimmed content.
   */
  it('should trim whitespace from valid prompts', () => {
    const whitespaceWrappedValidArb = fc.tuple(
      fc.array(fc.constantFrom(' ', '\t'), { minLength: 1, maxLength: 5 }).map(arr => arr.join('')),
      fc.string({ minLength: 1, maxLength: 100 }).filter(s => s.trim().length > 0),
      fc.array(fc.constantFrom(' ', '\t'), { minLength: 1, maxLength: 5 }).map(arr => arr.join(''))
    ).map(([prefix, content, suffix]) => ({
      original: prefix + content + suffix,
      expectedTrimmed: content.trim()
    }));

    fc.assert(
      fc.property(
        whitespaceWrappedValidArb,
        ({ original, expectedTrimmed }) => {
          const result = generateInputSchema.safeParse({
            prompt: original,
            conversationHistory: [],
          });

          // Property: Valid prompts with whitespace MUST pass validation
          expect(result.success).toBe(true);

          if (result.success) {
            // Property: Result should be trimmed
            expect(result.data.prompt).toBe(original.trim());
          }
        }
      ),
      { numRuns: 100 }
    );
  });
});
