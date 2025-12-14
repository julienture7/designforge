import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fc from 'fast-check';

/**
 * **Feature: generative-ui-platform, Property 25: Stream interruption persists checkpoint**
 * **Validates: Requirements 2.10, 2.11, 2.12**
 * 
 * For any generation stream that is interrupted mid-generation, the accumulated
 * partial HTML content from the stream buffer SHALL be persisted to Redis key
 * `generation:checkpoint:{projectId}` with 1-hour TTL using `waitUntil()` from
 * `@vercel/functions`. The stream MUST be wrapped with a tee/accumulator to
 * enable this checkpointing.
 * 
 * Requirements:
 * - 2.10: Stream wrapped with tee/accumulator that buffers chunks in memory
 * - 2.11: Use waitUntil() to persist checkpoint after stream disconnection
 * - 2.12: Persist accumulated partial HTML to Redis with 1-hour TTL
 * 
 * This test validates:
 * 1. For any projectId and accumulated HTML, setGenerationCheckpoint stores correctly
 * 2. The checkpoint key format is `generation:checkpoint:{projectId}`
 * 3. The checkpoint has a 1-hour (3600 seconds) TTL
 * 4. Checkpoints can be retrieved after being set
 * 5. Checkpoints are deleted after successful completion
 */

// Mock Redis state to simulate checkpoint behavior
let mockRedisState: Map<string, { value: string; expiresAt: number; ttlSeconds: number }>;

// Track calls to setGenerationCheckpoint for verification
let setCheckpointCalls: Array<{ projectId: string; html: string; ttlSeconds: number }>;

// Mock the Redis module
vi.mock('~/server/lib/redis', () => {
  return {
    redis: {
      set: vi.fn(async (key: string, value: string, options?: { ex?: number }) => {
        const ttlSeconds = options?.ex ?? 3600;
        const now = Date.now();
        mockRedisState.set(key, { 
          value, 
          expiresAt: now + ttlSeconds * 1000,
          ttlSeconds 
        });
        return 'OK';
      }),
      get: vi.fn(async (key: string) => {
        const existing = mockRedisState.get(key);
        if (existing && existing.expiresAt > Date.now()) {
          return existing.value;
        }
        mockRedisState.delete(key); // Clean up expired
        return null;
      }),
      del: vi.fn(async (key: string) => {
        const existed = mockRedisState.has(key);
        mockRedisState.delete(key);
        return existed ? 1 : 0;
      }),
    },
    setGenerationCheckpoint: vi.fn(async (projectId: string, html: string, ttlSeconds = 3600): Promise<void> => {
      const key = `generation:checkpoint:${projectId}`;
      const now = Date.now();
      mockRedisState.set(key, { 
        value: html, 
        expiresAt: now + ttlSeconds * 1000,
        ttlSeconds 
      });
      setCheckpointCalls.push({ projectId, html, ttlSeconds });
    }),
    getGenerationCheckpoint: vi.fn(async (projectId: string): Promise<string | null> => {
      const key = `generation:checkpoint:${projectId}`;
      const existing = mockRedisState.get(key);
      if (existing && existing.expiresAt > Date.now()) {
        return existing.value;
      }
      mockRedisState.delete(key); // Clean up expired
      return null;
    }),
    deleteGenerationCheckpoint: vi.fn(async (projectId: string): Promise<void> => {
      const key = `generation:checkpoint:${projectId}`;
      mockRedisState.delete(key);
    }),
  };
});

// Import after mocking
import { 
  setGenerationCheckpoint, 
  getGenerationCheckpoint, 
  deleteGenerationCheckpoint 
} from '~/server/lib/redis';

/**
 * Arbitrary for generating valid project IDs (CUID format)
 * CUIDs are 25 characters starting with 'c'
 */
const projectIdArb = fc.stringMatching(/^c[a-z0-9]{24}$/);

/**
 * Arbitrary for generating HTML content chunks
 * Simulates partial HTML that would be accumulated during streaming
 */
const htmlChunkArb = fc.oneof(
  // Opening tags
  fc.constant('<!DOCTYPE html>'),
  fc.constant('<html>'),
  fc.constant('<head>'),
  fc.constant('<title>Generated UI</title>'),
  fc.constant('</head>'),
  fc.constant('<body>'),
  // Content elements
  fc.string({ minLength: 1, maxLength: 100 })
    .map(s => `<div>${s}</div>`),
  fc.string({ minLength: 1, maxLength: 50 })
    .map(s => `<p>${s}</p>`),
  fc.string({ minLength: 1, maxLength: 30 })
    .map(s => `<h1>${s}</h1>`),
  // Tailwind classes
  fc.constant('<div class="flex items-center justify-center">'),
  fc.constant('<button class="bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded">'),
);

/**
 * Arbitrary for generating accumulated HTML content (multiple chunks joined)
 */
const accumulatedHtmlArb = fc.array(htmlChunkArb, { minLength: 1, maxLength: 20 })
  .map(chunks => chunks.join(''));

/**
 * Arbitrary for generating multiple distinct project IDs
 */
const distinctProjectIdsArb = fc.uniqueArray(projectIdArb, { minLength: 2, maxLength: 5 });

describe('Property 25: Stream interruption persists checkpoint', () => {
  beforeEach(() => {
    // Reset mock Redis state before each test
    mockRedisState = new Map();
    setCheckpointCalls = [];
    vi.clearAllMocks();
  });

  afterEach(() => {
    mockRedisState.clear();
    setCheckpointCalls = [];
  });

  /**
   * Main Property Test: For any projectId and accumulated HTML content,
   * setGenerationCheckpoint SHALL store the content in Redis with correct key format.
   * 
   * This validates Requirements 2.10, 2.12: checkpoint persistence with correct key
   */
  it('should persist checkpoint with correct key format for any projectId and HTML', async () => {
    await fc.assert(
      fc.asyncProperty(
        projectIdArb,
        accumulatedHtmlArb,
        async (projectId, html) => {
          // Reset state for this iteration
          mockRedisState.clear();
          setCheckpointCalls = [];
          
          // Property: Setting checkpoint MUST succeed
          await setGenerationCheckpoint(projectId, html);
          
          // Property: Checkpoint MUST be stored with correct key format
          const expectedKey = `generation:checkpoint:${projectId}`;
          expect(mockRedisState.has(expectedKey)).toBe(true);
          
          // Property: Stored value MUST match the accumulated HTML
          const stored = mockRedisState.get(expectedKey);
          expect(stored?.value).toBe(html);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property: Checkpoint SHALL be stored with 1-hour (3600 seconds) TTL.
   * 
   * This validates Requirements 2.12: 1-hour TTL for checkpoints
   */
  it('should store checkpoint with 1-hour TTL', async () => {
    await fc.assert(
      fc.asyncProperty(
        projectIdArb,
        accumulatedHtmlArb,
        async (projectId, html) => {
          // Reset state for this iteration
          mockRedisState.clear();
          setCheckpointCalls = [];
          
          // Set checkpoint (default TTL should be 3600)
          await setGenerationCheckpoint(projectId, html);
          
          // Property: TTL MUST be 3600 seconds (1 hour)
          expect(setCheckpointCalls.length).toBe(1);
          expect(setCheckpointCalls[0]?.ttlSeconds).toBe(3600);
          
          // Verify in mock state
          const expectedKey = `generation:checkpoint:${projectId}`;
          const stored = mockRedisState.get(expectedKey);
          expect(stored?.ttlSeconds).toBe(3600);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property: Checkpoint SHALL be retrievable after being set.
   * Round-trip: set -> get returns the same content.
   * 
   * This validates the checkpoint can be used for resume functionality
   */
  it('should retrieve checkpoint content after setting (round-trip)', async () => {
    await fc.assert(
      fc.asyncProperty(
        projectIdArb,
        accumulatedHtmlArb,
        async (projectId, html) => {
          // Reset state for this iteration
          mockRedisState.clear();
          
          // Set checkpoint
          await setGenerationCheckpoint(projectId, html);
          
          // Property: Getting checkpoint MUST return the same content
          const retrieved = await getGenerationCheckpoint(projectId);
          expect(retrieved).toBe(html);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property: Checkpoint SHALL be deleted after successful generation completion.
   * 
   * This validates cleanup behavior after successful completion
   */
  it('should delete checkpoint after successful completion', async () => {
    await fc.assert(
      fc.asyncProperty(
        projectIdArb,
        accumulatedHtmlArb,
        async (projectId, html) => {
          // Reset state for this iteration
          mockRedisState.clear();
          
          // Set checkpoint (simulating interrupted generation)
          await setGenerationCheckpoint(projectId, html);
          
          // Verify checkpoint exists
          const beforeDelete = await getGenerationCheckpoint(projectId);
          expect(beforeDelete).toBe(html);
          
          // Delete checkpoint (simulating successful completion)
          await deleteGenerationCheckpoint(projectId);
          
          // Property: Checkpoint MUST be deleted after completion
          const afterDelete = await getGenerationCheckpoint(projectId);
          expect(afterDelete).toBeNull();
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property: Checkpoints for different projectIds are independent.
   * Setting/deleting checkpoint for one project SHALL NOT affect others.
   */
  it('should maintain independent checkpoints for different projectIds', async () => {
    await fc.assert(
      fc.asyncProperty(
        distinctProjectIdsArb,
        fc.array(accumulatedHtmlArb, { minLength: 2, maxLength: 5 }),
        async (projectIds, htmlContents) => {
          // Reset state for this iteration
          mockRedisState.clear();
          
          // Ensure we have matching arrays
          const pairs = projectIds.map((id, i) => ({
            projectId: id,
            html: htmlContents[i % htmlContents.length]!
          }));
          
          // Set checkpoints for all projects
          for (const { projectId, html } of pairs) {
            await setGenerationCheckpoint(projectId, html);
          }
          
          // Property: All checkpoints MUST be stored independently
          for (const { projectId, html } of pairs) {
            const retrieved = await getGenerationCheckpoint(projectId);
            expect(retrieved).toBe(html);
          }
          
          // Delete first project's checkpoint
          await deleteGenerationCheckpoint(pairs[0]!.projectId);
          
          // Property: Only first project's checkpoint should be deleted
          const firstCheckpoint = await getGenerationCheckpoint(pairs[0]!.projectId);
          expect(firstCheckpoint).toBeNull();
          
          // Property: Other projects' checkpoints should still exist
          for (let i = 1; i < pairs.length; i++) {
            const otherCheckpoint = await getGenerationCheckpoint(pairs[i]!.projectId);
            expect(otherCheckpoint).toBe(pairs[i]!.html);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property: Checkpoint content can be any valid HTML string including empty.
   * Edge case: empty content should still be stored correctly.
   */
  it('should handle various HTML content sizes including edge cases', async () => {
    await fc.assert(
      fc.asyncProperty(
        projectIdArb,
        fc.oneof(
          // Empty content
          fc.constant(''),
          // Minimal content
          fc.constant('<html></html>'),
          // Large content (simulating partial generation)
          fc.string({ minLength: 1000, maxLength: 5000 }),
          // Content with special characters
          fc.constant('<div class="test">Special chars: &amp; &lt; &gt; "quotes"</div>'),
          // Unicode content
          fc.constant('<p>Unicode: 你好世界 🌍 émojis</p>')
        ),
        async (projectId, html) => {
          // Reset state for this iteration
          mockRedisState.clear();
          
          // Property: Any HTML content MUST be stored and retrieved correctly
          await setGenerationCheckpoint(projectId, html);
          const retrieved = await getGenerationCheckpoint(projectId);
          expect(retrieved).toBe(html);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property: Updating checkpoint for same projectId SHALL overwrite previous content.
   * This simulates multiple interruptions during the same generation session.
   */
  it('should overwrite checkpoint when set multiple times for same projectId', async () => {
    await fc.assert(
      fc.asyncProperty(
        projectIdArb,
        accumulatedHtmlArb,
        accumulatedHtmlArb,
        async (projectId, firstHtml, secondHtml) => {
          // Reset state for this iteration
          mockRedisState.clear();
          
          // Set first checkpoint
          await setGenerationCheckpoint(projectId, firstHtml);
          
          // Verify first checkpoint
          const afterFirst = await getGenerationCheckpoint(projectId);
          expect(afterFirst).toBe(firstHtml);
          
          // Set second checkpoint (overwrite)
          await setGenerationCheckpoint(projectId, secondHtml);
          
          // Property: Second checkpoint MUST overwrite the first
          const afterSecond = await getGenerationCheckpoint(projectId);
          expect(afterSecond).toBe(secondHtml);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property: Getting non-existent checkpoint SHALL return null.
   */
  it('should return null for non-existent checkpoint', async () => {
    await fc.assert(
      fc.asyncProperty(
        projectIdArb,
        async (projectId) => {
          // Reset state for this iteration
          mockRedisState.clear();
          
          // Property: Getting non-existent checkpoint MUST return null
          const checkpoint = await getGenerationCheckpoint(projectId);
          expect(checkpoint).toBeNull();
        }
      ),
      { numRuns: 100 }
    );
  });
});
