import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as fc from 'fast-check';

/**
 * **Feature: generative-ui-platform, Property 16: Project visibility matches user tier**
 * **Validates: Requirements 5.5, 5.6**
 * 
 * For any project created by a FREE tier user, `visibility` SHALL be `PUBLIC`.
 * For any project created by a PRO tier user, `visibility` SHALL default to `PRIVATE`.
 * 
 * Requirements 5.5 specifies:
 * "WHEN Free tier user creates project THEN the Project_System SHALL set `visibility: 'PUBLIC'` 
 * and display "Public" badge"
 * 
 * Requirements 5.6 specifies:
 * "WHEN Pro tier user creates project THEN the Project_System SHALL set `visibility: 'PRIVATE'` 
 * by default with toggle to make public"
 */

/**
 * User tier type matching Prisma schema
 */
type Tier = 'FREE' | 'PRO';

/**
 * Visibility type matching Prisma schema
 */
type Visibility = 'PUBLIC' | 'PRIVATE';

/**
 * User record type (simplified for testing)
 */
interface User {
  id: string;
  email: string;
  tier: Tier;
}

/**
 * Project create input type
 */
interface ProjectCreateInput {
  title: string;
  htmlContent?: string;
  conversationHistory?: Array<{ role: 'user' | 'model'; content: string }>;
}

/**
 * Project record type (simplified for testing)
 */
interface Project {
  id: string;
  userId: string;
  title: string;
  htmlContent: string;
  conversationHistory: Array<{ role: 'user' | 'model'; content: string }>;
  visibility: Visibility;
  tokenUsage: number;
  versionHistory: Array<{ html: string; timestamp: string }>;
  generationCount: number;
  createdAt: Date;
  updatedAt: Date;
}

// Mock database state
let mockProjects: Map<string, Project>;
let mockUsers: Map<string, User>;

/**
 * Simulates the project.create mutation behavior.
 * This mirrors what the actual project router does when creating a project.
 * 
 * @param userId - The user creating the project
 * @param input - Project creation input
 * @returns The created project
 */
function createProject(userId: string, input: ProjectCreateInput): Project | null {
  const user = mockUsers.get(userId);
  if (!user) {
    return null;
  }

  // Set visibility based on tier (FREE=PUBLIC, PRO=PRIVATE)
  // This is the core logic being tested - Requirements 5.5 and 5.6
  const visibility: Visibility = user.tier === 'PRO' ? 'PRIVATE' : 'PUBLIC';

  const id = `c${Math.random().toString(36).substring(2, 26)}`;
  const project: Project = {
    id,
    userId,
    title: input.title,
    htmlContent: input.htmlContent ?? '',
    conversationHistory: input.conversationHistory ?? [],
    visibility,
    tokenUsage: 0,
    versionHistory: [],
    generationCount: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  mockProjects.set(id, project);
  return project;
}

/**
 * Arbitrary for generating valid CUID-like IDs
 */
const cuidArb = fc.stringMatching(/^c[a-z0-9]{24}$/);

/**
 * Arbitrary for generating valid email addresses
 */
const emailArb = fc.emailAddress();

/**
 * Arbitrary for generating project titles
 */
const titleArb = fc.string({ minLength: 1, maxLength: 200 })
  .filter(s => s.trim().length > 0);

/**
 * Arbitrary for generating optional HTML content
 */
const htmlContentArb = fc.option(
  fc.string({ minLength: 0, maxLength: 500 })
    .map(s => `<!DOCTYPE html><html><body>${s}</body></html>`),
  { nil: undefined }
);

/**
 * Arbitrary for generating conversation messages
 */
const conversationMessageArb = fc.record({
  role: fc.constantFrom('user' as const, 'model' as const),
  content: fc.string({ minLength: 1, maxLength: 200 }),
});

/**
 * Arbitrary for generating optional conversation history
 */
const conversationHistoryArb = fc.option(
  fc.array(conversationMessageArb, { minLength: 0, maxLength: 10 }),
  { nil: undefined }
);

/**
 * Arbitrary for generating project create input
 */
const projectCreateInputArb = fc.record({
  title: titleArb,
  htmlContent: htmlContentArb,
  conversationHistory: conversationHistoryArb,
});

/**
 * Arbitrary for generating FREE tier users
 */
const freeUserArb = fc.record({
  id: cuidArb,
  email: emailArb,
  tier: fc.constant('FREE' as Tier),
});

/**
 * Arbitrary for generating PRO tier users
 */
const proUserArb = fc.record({
  id: cuidArb,
  email: emailArb,
  tier: fc.constant('PRO' as Tier),
});

/**
 * Arbitrary for generating any user (FREE or PRO)
 */
const userArb = fc.record({
  id: cuidArb,
  email: emailArb,
  tier: fc.constantFrom('FREE' as Tier, 'PRO' as Tier),
});

describe('Property 16: Project visibility matches user tier', () => {
  beforeEach(() => {
    // Reset mock state before each test
    mockProjects = new Map();
    mockUsers = new Map();
    vi.clearAllMocks();
  });

  /**
   * Main Property Test: For any FREE tier user creating a project,
   * the visibility SHALL be PUBLIC.
   * 
   * This validates Requirements 5.5
   */
  it('should set visibility to PUBLIC for FREE tier users', () => {
    fc.assert(
      fc.property(
        freeUserArb,
        projectCreateInputArb,
        (user, input) => {
          // Setup: Add FREE tier user to mock database
          mockUsers.set(user.id, user);
          
          // Execute: Create project
          const project = createProject(user.id, input);
          
          // Property: Project MUST be created
          expect(project).not.toBeNull();
          
          if (project) {
            // Property: visibility MUST be PUBLIC for FREE tier users
            expect(project.visibility).toBe('PUBLIC');
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Main Property Test: For any PRO tier user creating a project,
   * the visibility SHALL default to PRIVATE.
   * 
   * This validates Requirements 5.6
   */
  it('should set visibility to PRIVATE for PRO tier users', () => {
    fc.assert(
      fc.property(
        proUserArb,
        projectCreateInputArb,
        (user, input) => {
          // Setup: Add PRO tier user to mock database
          mockUsers.set(user.id, user);
          
          // Execute: Create project
          const project = createProject(user.id, input);
          
          // Property: Project MUST be created
          expect(project).not.toBeNull();
          
          if (project) {
            // Property: visibility MUST be PRIVATE for PRO tier users
            expect(project.visibility).toBe('PRIVATE');
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Combined Property Test: For any user, visibility SHALL match their tier.
   * FREE -> PUBLIC, PRO -> PRIVATE
   * 
   * This validates Requirements 5.5 and 5.6 together
   */
  it('should set visibility based on user tier (FREE=PUBLIC, PRO=PRIVATE)', () => {
    fc.assert(
      fc.property(
        userArb,
        projectCreateInputArb,
        (user, input) => {
          // Setup: Add user to mock database
          mockUsers.set(user.id, user);
          
          // Execute: Create project
          const project = createProject(user.id, input);
          
          // Property: Project MUST be created
          expect(project).not.toBeNull();
          
          if (project) {
            // Property: visibility MUST match tier mapping
            const expectedVisibility: Visibility = user.tier === 'PRO' ? 'PRIVATE' : 'PUBLIC';
            expect(project.visibility).toBe(expectedVisibility);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property: Multiple projects created by same user SHALL have consistent visibility.
   * All projects from a FREE user should be PUBLIC, all from PRO should be PRIVATE.
   */
  it('should maintain consistent visibility across multiple projects for same user', () => {
    fc.assert(
      fc.property(
        userArb,
        fc.array(projectCreateInputArb, { minLength: 2, maxLength: 10 }),
        (user, inputs) => {
          // Setup: Add user to mock database
          mockUsers.set(user.id, user);
          
          // Execute: Create multiple projects
          const projects = inputs.map(input => createProject(user.id, input));
          
          // Property: All projects MUST be created
          expect(projects.every(p => p !== null)).toBe(true);
          
          // Property: All projects MUST have same visibility based on tier
          const expectedVisibility: Visibility = user.tier === 'PRO' ? 'PRIVATE' : 'PUBLIC';
          for (const project of projects) {
            if (project) {
              expect(project.visibility).toBe(expectedVisibility);
            }
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property: Project visibility SHALL be independent of project content.
   * The title, htmlContent, and conversationHistory should not affect visibility.
   */
  it('should set visibility independent of project content', () => {
    fc.assert(
      fc.property(
        userArb,
        projectCreateInputArb,
        projectCreateInputArb,
        (user, input1, input2) => {
          // Setup: Add user to mock database
          mockUsers.set(user.id, user);
          
          // Execute: Create two projects with different content
          const project1 = createProject(user.id, input1);
          const project2 = createProject(user.id, input2);
          
          // Property: Both projects MUST be created
          expect(project1).not.toBeNull();
          expect(project2).not.toBeNull();
          
          if (project1 && project2) {
            // Property: Both projects MUST have same visibility
            expect(project1.visibility).toBe(project2.visibility);
            
            // Property: Visibility MUST match tier
            const expectedVisibility: Visibility = user.tier === 'PRO' ? 'PRIVATE' : 'PUBLIC';
            expect(project1.visibility).toBe(expectedVisibility);
            expect(project2.visibility).toBe(expectedVisibility);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property: Project SHALL have correct userId after creation.
   * The userId must match the user who created the project.
   */
  it('should set correct userId on created project', () => {
    fc.assert(
      fc.property(
        userArb,
        projectCreateInputArb,
        (user, input) => {
          // Setup: Add user to mock database
          mockUsers.set(user.id, user);
          
          // Execute: Create project
          const project = createProject(user.id, input);
          
          // Property: Project MUST be created
          expect(project).not.toBeNull();
          
          if (project) {
            // Property: userId MUST match the creating user
            expect(project.userId).toBe(user.id);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property: Project creation SHALL fail for non-existent users.
   * This ensures proper authorization checks.
   */
  it('should return null for non-existent users', () => {
    fc.assert(
      fc.property(
        cuidArb,
        projectCreateInputArb,
        (nonExistentUserId, input) => {
          // Setup: Do NOT add user to mock database
          // mockUsers is empty
          
          // Execute: Attempt to create project
          const project = createProject(nonExistentUserId, input);
          
          // Property: Project MUST NOT be created
          expect(project).toBeNull();
        }
      ),
      { numRuns: 100 }
    );
  });
});
