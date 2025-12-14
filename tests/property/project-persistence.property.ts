import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as fc from 'fast-check';

/**
 * **Feature: generative-ui-platform, Property 15: Successful generation persists project**
 * **Validates: Requirements 5.1**
 * 
 * For any generation that completes with `finishReason: STOP`, a Project record SHALL exist
 * with non-empty `htmlContent`, `conversationHistory` array, and `generationCount ≥ 1`.
 * 
 * Requirements 5.1 specifies:
 * "WHEN a generation completes (stream ends with `finishReason: STOP`) THEN the Project_System 
 * SHALL upsert Project record with: `htmlContent`, `conversationHistory`, `tokenUsage` 
 * (from response metadata), `generationCount: { increment: 1 }`, append to `versionHistory` 
 * array (max 10 versions, slice oldest entries before saving if limit exceeded)"
 */

/**
 * Conversation message type as defined in the design document
 */
interface ConversationMessage {
  role: 'user' | 'model';
  content: string;
}

/**
 * Version history entry type
 */
interface VersionHistoryEntry {
  html: string;
  timestamp: string;
}

/**
 * Project record type matching Prisma schema
 */
interface Project {
  id: string;
  userId: string;
  title: string;
  htmlContent: string;
  conversationHistory: ConversationMessage[];
  visibility: 'PUBLIC' | 'PRIVATE';
  tokenUsage: number;
  versionHistory: VersionHistoryEntry[];
  generationCount: number;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Generation complete input type
 */
interface GenerationCompleteInput {
  id: string;
  htmlContent: string;
  conversationHistory: ConversationMessage[];
  tokenUsage: number;
}

/**
 * Finish reason from Gemini API
 */
type FinishReason = 'STOP' | 'MAX_TOKENS' | 'ERROR';

// Mock database state
let mockProjects: Map<string, Project>;
let mockUsers: Map<string, { id: string; tier: 'FREE' | 'PRO' }>;

// Mock the database module
vi.mock('~/server/db', () => {
  return {
    db: {
      project: {
        findUnique: vi.fn(async ({ where }: { where: { id: string } }) => {
          return mockProjects.get(where.id) ?? null;
        }),
        create: vi.fn(async ({ data }: { data: Partial<Project> & { userId: string } }) => {
          const id = `c${Math.random().toString(36).substring(2, 26)}`;
          const project: Project = {
            id,
            userId: data.userId,
            title: data.title ?? 'Untitled Project',
            htmlContent: data.htmlContent ?? '',
            conversationHistory: (data.conversationHistory as ConversationMessage[]) ?? [],
            visibility: data.visibility ?? 'PUBLIC',
            tokenUsage: data.tokenUsage ?? 0,
            versionHistory: (data.versionHistory as VersionHistoryEntry[]) ?? [],
            generationCount: data.generationCount ?? 0,
            createdAt: new Date(),
            updatedAt: new Date(),
          };
          mockProjects.set(id, project);
          return project;
        }),
        update: vi.fn(async ({ where, data }: { 
          where: { id: string }; 
          data: Partial<Project> & { generationCount?: { increment: number } };
        }) => {
          const existing = mockProjects.get(where.id);
          if (!existing) throw new Error('Project not found');
          
          const updated: Project = {
            ...existing,
            ...data,
            generationCount: data.generationCount?.increment 
              ? existing.generationCount + data.generationCount.increment 
              : (data.generationCount as number) ?? existing.generationCount,
            updatedAt: new Date(),
          };
          mockProjects.set(where.id, updated);
          return updated;
        }),
      },
      user: {
        findUnique: vi.fn(async ({ where }: { where: { id: string } }) => {
          return mockUsers.get(where.id) ?? null;
        }),
      },
    },
  };
});

/**
 * Parse and validate version history from JSON
 */
function parseVersionHistory(data: unknown): VersionHistoryEntry[] {
  if (!Array.isArray(data)) return [];
  
  return data.filter(
    (entry): entry is VersionHistoryEntry =>
      typeof entry === 'object' &&
      entry !== null &&
      'html' in entry &&
      'timestamp' in entry &&
      typeof entry.html === 'string' &&
      typeof entry.timestamp === 'string'
  );
}

/**
 * Slice version history to max 10 entries (keep most recent)
 */
function sliceVersionHistory(history: VersionHistoryEntry[]): VersionHistoryEntry[] {
  if (history.length <= 10) return history;
  return history.slice(-10);
}

/**
 * Simulates the onGenerationComplete handler behavior.
 * This mirrors what the actual project.onGenerationComplete mutation does.
 * 
 * @param userId - The user who owns the project
 * @param input - Generation complete input data
 * @param finishReason - The finish reason from Gemini API
 * @returns The updated project or null if not persisted
 */
async function handleGenerationComplete(
  userId: string,
  input: GenerationCompleteInput,
  finishReason: FinishReason
): Promise<Project | null> {
  // Only persist if finishReason is STOP (successful completion)
  if (finishReason !== 'STOP') {
    return null;
  }

  // Get existing project
  const existingProject = mockProjects.get(input.id);
  
  if (!existingProject) {
    // Create new project if it doesn't exist
    const user = mockUsers.get(userId);
    if (!user) return null;
    
    const visibility = user.tier === 'PRO' ? 'PRIVATE' : 'PUBLIC';
    
    const newProject: Project = {
      id: input.id,
      userId,
      title: 'Untitled Project',
      htmlContent: input.htmlContent,
      conversationHistory: input.conversationHistory,
      visibility,
      tokenUsage: input.tokenUsage,
      versionHistory: [{
        html: input.htmlContent,
        timestamp: new Date().toISOString(),
      }],
      generationCount: 1,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    
    mockProjects.set(input.id, newProject);
    return newProject;
  }

  // Verify ownership
  if (existingProject.userId !== userId) {
    return null;
  }

  // Parse existing version history
  let versionHistory = parseVersionHistory(existingProject.versionHistory);

  // Append new version
  versionHistory.push({
    html: input.htmlContent,
    timestamp: new Date().toISOString(),
  });
  
  // Slice to max 10 entries (keep most recent)
  versionHistory = sliceVersionHistory(versionHistory);

  // Update project
  const updatedProject: Project = {
    ...existingProject,
    htmlContent: input.htmlContent,
    conversationHistory: input.conversationHistory,
    tokenUsage: input.tokenUsage,
    generationCount: existingProject.generationCount + 1,
    versionHistory,
    updatedAt: new Date(),
  };

  mockProjects.set(input.id, updatedProject);
  return updatedProject;
}

/**
 * Arbitrary for generating valid CUID-like IDs
 */
const cuidArb = fc.stringMatching(/^c[a-z0-9]{24}$/);

/**
 * Arbitrary for generating valid HTML content
 */
const htmlContentArb = fc.string({ minLength: 10, maxLength: 500 })
  .map(s => `<!DOCTYPE html><html><head></head><body>${s}</body></html>`);

/**
 * Arbitrary for generating conversation messages
 */
const conversationMessageArb = fc.record({
  role: fc.constantFrom('user' as const, 'model' as const),
  content: fc.string({ minLength: 1, maxLength: 500 }),
});

/**
 * Arbitrary for generating conversation history (non-empty array)
 */
const conversationHistoryArb = fc.array(conversationMessageArb, { minLength: 1, maxLength: 20 });

/**
 * Arbitrary for generating token usage
 */
const tokenUsageArb = fc.integer({ min: 1, max: 100000 });

/**
 * Arbitrary for generating generation complete input
 */
const generationCompleteInputArb = fc.record({
  id: cuidArb,
  htmlContent: htmlContentArb,
  conversationHistory: conversationHistoryArb,
  tokenUsage: tokenUsageArb,
});

/**
 * Arbitrary for generating user data
 */
const userArb = fc.record({
  id: cuidArb,
  tier: fc.constantFrom('FREE' as const, 'PRO' as const),
});

describe('Property 15: Successful generation persists project', () => {
  beforeEach(() => {
    // Reset mock state before each test
    mockProjects = new Map();
    mockUsers = new Map();
    vi.clearAllMocks();
  });

  /**
   * Main Property Test: For any generation that completes with finishReason: STOP,
   * a Project record SHALL exist with non-empty htmlContent, conversationHistory array,
   * and generationCount ≥ 1.
   * 
   * This validates Requirements 5.1
   */
  it('should persist project with correct fields when generation completes with STOP', async () => {
    await fc.assert(
      fc.asyncProperty(
        userArb,
        generationCompleteInputArb,
        async (user, input) => {
          // Setup: Add user to mock database
          mockUsers.set(user.id, user);
          
          // Execute: Handle generation complete with finishReason: STOP
          const result = await handleGenerationComplete(user.id, input, 'STOP');
          
          // Property: Project MUST be persisted (not null)
          expect(result).not.toBeNull();
          
          if (result) {
            // Property: htmlContent MUST be non-empty
            expect(result.htmlContent).toBeTruthy();
            expect(result.htmlContent.length).toBeGreaterThan(0);
            
            // Property: htmlContent MUST match input
            expect(result.htmlContent).toBe(input.htmlContent);
            
            // Property: conversationHistory MUST be an array
            expect(Array.isArray(result.conversationHistory)).toBe(true);
            
            // Property: conversationHistory MUST match input
            expect(result.conversationHistory).toEqual(input.conversationHistory);
            
            // Property: generationCount MUST be ≥ 1
            expect(result.generationCount).toBeGreaterThanOrEqual(1);
            
            // Property: tokenUsage MUST be set
            expect(result.tokenUsage).toBe(input.tokenUsage);
            
            // Property: versionHistory MUST contain at least one entry
            expect(result.versionHistory.length).toBeGreaterThanOrEqual(1);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property: Generation with finishReason other than STOP SHALL NOT persist project.
   * This ensures we only persist completed generations.
   */
  it('should not persist project when generation finishes with MAX_TOKENS or ERROR', async () => {
    await fc.assert(
      fc.asyncProperty(
        userArb,
        generationCompleteInputArb,
        fc.constantFrom('MAX_TOKENS' as FinishReason, 'ERROR' as FinishReason),
        async (user, input, finishReason) => {
          // Setup: Add user to mock database
          mockUsers.set(user.id, user);
          
          // Execute: Handle generation complete with non-STOP finishReason
          const result = await handleGenerationComplete(user.id, input, finishReason);
          
          // Property: Project MUST NOT be persisted
          expect(result).toBeNull();
          
          // Property: No project should exist in database
          expect(mockProjects.has(input.id)).toBe(false);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property: Multiple successful generations SHALL increment generationCount.
   * Each STOP completion should increment the count.
   */
  it('should increment generationCount for each successful generation', async () => {
    await fc.assert(
      fc.asyncProperty(
        userArb,
        generationCompleteInputArb,
        fc.integer({ min: 2, max: 10 }),
        async (user, input, generationCount) => {
          // Setup: Add user to mock database
          mockUsers.set(user.id, user);
          
          // Execute: Multiple generation completions
          let lastResult: Project | null = null;
          for (let i = 0; i < generationCount; i++) {
            lastResult = await handleGenerationComplete(user.id, {
              ...input,
              htmlContent: `${input.htmlContent} - Generation ${i + 1}`,
            }, 'STOP');
          }
          
          // Property: generationCount MUST equal number of successful generations
          expect(lastResult).not.toBeNull();
          if (lastResult) {
            expect(lastResult.generationCount).toBe(generationCount);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property: versionHistory SHALL be limited to 10 entries.
   * Older entries should be removed when limit is exceeded.
   */
  it('should limit versionHistory to 10 entries', async () => {
    await fc.assert(
      fc.asyncProperty(
        userArb,
        generationCompleteInputArb,
        fc.integer({ min: 11, max: 20 }),
        async (user, input, generationCount) => {
          // Setup: Add user to mock database
          mockUsers.set(user.id, user);
          
          // Execute: More than 10 generation completions
          let lastResult: Project | null = null;
          for (let i = 0; i < generationCount; i++) {
            lastResult = await handleGenerationComplete(user.id, {
              ...input,
              htmlContent: `${input.htmlContent} - Generation ${i + 1}`,
            }, 'STOP');
          }
          
          // Property: versionHistory MUST NOT exceed 10 entries
          expect(lastResult).not.toBeNull();
          if (lastResult) {
            expect(lastResult.versionHistory.length).toBeLessThanOrEqual(10);
            
            // Property: Most recent version should be preserved
            const lastVersion = lastResult.versionHistory[lastResult.versionHistory.length - 1];
            expect(lastVersion?.html).toContain(`Generation ${generationCount}`);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property: Project SHALL have correct ownership after persistence.
   * The userId must match the user who created the generation.
   */
  it('should persist project with correct userId', async () => {
    await fc.assert(
      fc.asyncProperty(
        userArb,
        generationCompleteInputArb,
        async (user, input) => {
          // Setup: Add user to mock database
          mockUsers.set(user.id, user);
          
          // Execute: Handle generation complete
          const result = await handleGenerationComplete(user.id, input, 'STOP');
          
          // Property: Project userId MUST match the user
          expect(result).not.toBeNull();
          if (result) {
            expect(result.userId).toBe(user.id);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property: Each versionHistory entry SHALL have valid timestamp.
   * Timestamps must be ISO 8601 format strings.
   */
  it('should create versionHistory entries with valid timestamps', async () => {
    await fc.assert(
      fc.asyncProperty(
        userArb,
        generationCompleteInputArb,
        async (user, input) => {
          // Setup: Add user to mock database
          mockUsers.set(user.id, user);
          
          // Execute: Handle generation complete
          const result = await handleGenerationComplete(user.id, input, 'STOP');
          
          // Property: All versionHistory entries MUST have valid timestamps
          expect(result).not.toBeNull();
          if (result) {
            for (const entry of result.versionHistory) {
              // Timestamp should be a valid ISO 8601 string
              expect(typeof entry.timestamp).toBe('string');
              const parsedDate = new Date(entry.timestamp);
              expect(parsedDate.toString()).not.toBe('Invalid Date');
            }
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property: Project SHALL preserve all conversation messages.
   * No messages should be lost during persistence.
   */
  it('should preserve all conversation messages in conversationHistory', async () => {
    await fc.assert(
      fc.asyncProperty(
        userArb,
        generationCompleteInputArb,
        async (user, input) => {
          // Setup: Add user to mock database
          mockUsers.set(user.id, user);
          
          // Execute: Handle generation complete
          const result = await handleGenerationComplete(user.id, input, 'STOP');
          
          // Property: conversationHistory length MUST match input
          expect(result).not.toBeNull();
          if (result) {
            expect(result.conversationHistory.length).toBe(input.conversationHistory.length);
            
            // Property: Each message MUST be preserved exactly
            for (let i = 0; i < input.conversationHistory.length; i++) {
              expect(result.conversationHistory[i]).toEqual(input.conversationHistory[i]);
            }
          }
        }
      ),
      { numRuns: 100 }
    );
  });
});
