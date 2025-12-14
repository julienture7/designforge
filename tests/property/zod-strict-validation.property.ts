import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { generateInputSchema, resumeGenerationInputSchema } from '../../src/lib/validators/generate';
import { 
  projectListInputSchema, 
  projectGetSchema, 
  projectCreateSchema, 
  projectUpdateSchema, 
  projectDeleteSchema,
  generationCompleteSchema,
} from '../../src/lib/validators/project';
import { 
  conversationMessageSchema, 
  paginationSchema, 
  imageProxyQuerySchema,
} from '../../src/lib/validators/common';

/**
 * **Feature: generative-ui-platform, Property 24: Zod strict mode rejects unknown keys**
 * **Validates: Requirements 8.1**
 * 
 * For any tRPC procedure input containing keys not defined in the Zod schema,
 * validation SHALL fail with `VALIDATION_ERROR`.
 * 
 * Requirements 8.1 specifies:
 * "WHEN any tRPC procedure receives input THEN the Validation_System SHALL
 * validate using Zod schema with `.strict()` mode (reject unknown keys)"
 */

/**
 * Arbitrary for generating random unknown key names
 * Generates keys that are unlikely to collide with actual schema keys
 */
const unknownKeyArb = fc.string({ minLength: 1, maxLength: 20 })
  .filter(s => {
    // Filter out keys that might be valid schema keys
    const reservedKeys = [
      'projectId', 'prompt', 'conversationHistory', 'role', 'content',
      'page', 'pageSize', 'visibility', 'id', 'title', 'htmlContent',
      'tokenUsage', 'html', 'timestamp', 'query', 'successUrl', 'cancelUrl',
      'returnUrl',
    ];
    return !reservedKeys.includes(s) && s.trim().length > 0;
  })
  .map(s => `_unknown_${s}`); // Prefix to ensure uniqueness

/**
 * Arbitrary for generating random values for unknown keys
 */
const unknownValueArb = fc.oneof(
  fc.string(),
  fc.integer(),
  fc.boolean(),
  fc.constant(null),
  fc.array(fc.string()),
  fc.dictionary(fc.string(), fc.string()),
);

/**
 * Helper to add unknown keys to an object
 */
function addUnknownKeys(
  baseObject: Record<string, unknown>,
  unknownKeys: Array<{ key: string; value: unknown }>
): Record<string, unknown> {
  const result = { ...baseObject };
  for (const { key, value } of unknownKeys) {
    result[key] = value;
  }
  return result;
}

describe('Property 24: Zod strict mode rejects unknown keys', () => {
  /**
   * Property: For any generateInputSchema input with extra unknown keys,
   * validation SHALL fail with unrecognized_keys error.
   */
  it('should reject generateInputSchema inputs with unknown keys', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({ key: unknownKeyArb, value: unknownValueArb }),
          { minLength: 1, maxLength: 3 }
        ),
        (unknownKeys) => {
          const validInput = {
            prompt: 'Create a landing page',
            conversationHistory: [],
          };
          
          const inputWithUnknownKeys = addUnknownKeys(validInput, unknownKeys);
          const result = generateInputSchema.safeParse(inputWithUnknownKeys);

          // Property: Inputs with unknown keys MUST fail validation
          expect(result.success).toBe(false);

          if (!result.success) {
            // Property: Error should be unrecognized_keys
            const hasUnrecognizedKeysError = result.error.errors.some(
              e => e.code === 'unrecognized_keys'
            );
            expect(hasUnrecognizedKeysError).toBe(true);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property: For any projectListInputSchema input with extra unknown keys,
   * validation SHALL fail with unrecognized_keys error.
   */
  it('should reject projectListInputSchema inputs with unknown keys', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({ key: unknownKeyArb, value: unknownValueArb }),
          { minLength: 1, maxLength: 3 }
        ),
        (unknownKeys) => {
          const validInput = {
            page: 1,
            pageSize: 20,
          };
          
          const inputWithUnknownKeys = addUnknownKeys(validInput, unknownKeys);
          const result = projectListInputSchema.safeParse(inputWithUnknownKeys);

          // Property: Inputs with unknown keys MUST fail validation
          expect(result.success).toBe(false);

          if (!result.success) {
            const hasUnrecognizedKeysError = result.error.errors.some(
              e => e.code === 'unrecognized_keys'
            );
            expect(hasUnrecognizedKeysError).toBe(true);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property: For any projectCreateSchema input with extra unknown keys,
   * validation SHALL fail with unrecognized_keys error.
   */
  it('should reject projectCreateSchema inputs with unknown keys', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({ key: unknownKeyArb, value: unknownValueArb }),
          { minLength: 1, maxLength: 3 }
        ),
        (unknownKeys) => {
          const validInput = {
            title: 'My Project',
          };
          
          const inputWithUnknownKeys = addUnknownKeys(validInput, unknownKeys);
          const result = projectCreateSchema.safeParse(inputWithUnknownKeys);

          // Property: Inputs with unknown keys MUST fail validation
          expect(result.success).toBe(false);

          if (!result.success) {
            const hasUnrecognizedKeysError = result.error.errors.some(
              e => e.code === 'unrecognized_keys'
            );
            expect(hasUnrecognizedKeysError).toBe(true);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property: For any projectUpdateSchema input with extra unknown keys,
   * validation SHALL fail with unrecognized_keys error.
   */
  it('should reject projectUpdateSchema inputs with unknown keys', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({ key: unknownKeyArb, value: unknownValueArb }),
          { minLength: 1, maxLength: 3 }
        ),
        (unknownKeys) => {
          const validInput = {
            id: 'clxxxxxxxxxxxxxxxxxxxxxxxxx', // Valid CUID format
            title: 'Updated Title',
          };
          
          const inputWithUnknownKeys = addUnknownKeys(validInput, unknownKeys);
          const result = projectUpdateSchema.safeParse(inputWithUnknownKeys);

          // Property: Inputs with unknown keys MUST fail validation
          expect(result.success).toBe(false);

          if (!result.success) {
            const hasUnrecognizedKeysError = result.error.errors.some(
              e => e.code === 'unrecognized_keys'
            );
            expect(hasUnrecognizedKeysError).toBe(true);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property: For any conversationMessageSchema input with extra unknown keys,
   * validation SHALL fail with unrecognized_keys error.
   */
  it('should reject conversationMessageSchema inputs with unknown keys', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({ key: unknownKeyArb, value: unknownValueArb }),
          { minLength: 1, maxLength: 3 }
        ),
        (unknownKeys) => {
          const validInput = {
            role: 'user' as const,
            content: 'Hello',
          };
          
          const inputWithUnknownKeys = addUnknownKeys(validInput, unknownKeys);
          const result = conversationMessageSchema.safeParse(inputWithUnknownKeys);

          // Property: Inputs with unknown keys MUST fail validation
          expect(result.success).toBe(false);

          if (!result.success) {
            const hasUnrecognizedKeysError = result.error.errors.some(
              e => e.code === 'unrecognized_keys'
            );
            expect(hasUnrecognizedKeysError).toBe(true);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property: For any imageProxyQuerySchema input with extra unknown keys,
   * validation SHALL fail with unrecognized_keys error.
   */
  it('should reject imageProxyQuerySchema inputs with unknown keys', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({ key: unknownKeyArb, value: unknownValueArb }),
          { minLength: 1, maxLength: 3 }
        ),
        (unknownKeys) => {
          const validInput = {
            query: 'sunset beach',
          };
          
          const inputWithUnknownKeys = addUnknownKeys(validInput, unknownKeys);
          const result = imageProxyQuerySchema.safeParse(inputWithUnknownKeys);

          // Property: Inputs with unknown keys MUST fail validation
          expect(result.success).toBe(false);

          if (!result.success) {
            const hasUnrecognizedKeysError = result.error.errors.some(
              e => e.code === 'unrecognized_keys'
            );
            expect(hasUnrecognizedKeysError).toBe(true);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property: Valid inputs without unknown keys SHALL pass validation.
   * This ensures we're not breaking valid inputs.
   */
  it('should accept valid inputs without unknown keys', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 100 }).filter(s => s.trim().length > 0),
        (prompt) => {
          const validInput = {
            prompt,
            conversationHistory: [],
          };
          
          const result = generateInputSchema.safeParse(validInput);

          // Property: Valid inputs MUST pass validation
          expect(result.success).toBe(true);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property: For any resumeGenerationInputSchema input with extra unknown keys,
   * validation SHALL fail with unrecognized_keys error.
   */
  it('should reject resumeGenerationInputSchema inputs with unknown keys', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({ key: unknownKeyArb, value: unknownValueArb }),
          { minLength: 1, maxLength: 3 }
        ),
        (unknownKeys) => {
          const validInput = {
            projectId: 'clxxxxxxxxxxxxxxxxxxxxxxxxx', // Valid CUID format
          };
          
          const inputWithUnknownKeys = addUnknownKeys(validInput, unknownKeys);
          const result = resumeGenerationInputSchema.safeParse(inputWithUnknownKeys);

          // Property: Inputs with unknown keys MUST fail validation
          expect(result.success).toBe(false);

          if (!result.success) {
            const hasUnrecognizedKeysError = result.error.errors.some(
              e => e.code === 'unrecognized_keys'
            );
            expect(hasUnrecognizedKeysError).toBe(true);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property: For any paginationSchema input with extra unknown keys,
   * validation SHALL fail with unrecognized_keys error.
   */
  it('should reject paginationSchema inputs with unknown keys', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({ key: unknownKeyArb, value: unknownValueArb }),
          { minLength: 1, maxLength: 3 }
        ),
        (unknownKeys) => {
          const validInput = {
            page: 1,
            pageSize: 20,
          };
          
          const inputWithUnknownKeys = addUnknownKeys(validInput, unknownKeys);
          const result = paginationSchema.safeParse(inputWithUnknownKeys);

          // Property: Inputs with unknown keys MUST fail validation
          expect(result.success).toBe(false);

          if (!result.success) {
            const hasUnrecognizedKeysError = result.error.errors.some(
              e => e.code === 'unrecognized_keys'
            );
            expect(hasUnrecognizedKeysError).toBe(true);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property: For any generationCompleteSchema input with extra unknown keys,
   * validation SHALL fail with unrecognized_keys error.
   */
  it('should reject generationCompleteSchema inputs with unknown keys', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({ key: unknownKeyArb, value: unknownValueArb }),
          { minLength: 1, maxLength: 3 }
        ),
        (unknownKeys) => {
          const validInput = {
            id: 'clxxxxxxxxxxxxxxxxxxxxxxxxx', // Valid CUID format
            htmlContent: '<html></html>',
            conversationHistory: [],
            tokenUsage: 100,
          };
          
          const inputWithUnknownKeys = addUnknownKeys(validInput, unknownKeys);
          const result = generationCompleteSchema.safeParse(inputWithUnknownKeys);

          // Property: Inputs with unknown keys MUST fail validation
          expect(result.success).toBe(false);

          if (!result.success) {
            const hasUnrecognizedKeysError = result.error.errors.some(
              e => e.code === 'unrecognized_keys'
            );
            expect(hasUnrecognizedKeysError).toBe(true);
          }
        }
      ),
      { numRuns: 100 }
    );
  });
});
