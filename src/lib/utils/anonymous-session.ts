/**
 * Anonymous Session Management
 * 
 * Utilities for managing anonymous user sessions.
 * Sessions are stored in localStorage and used to track
 * temporary projects that can be migrated on signup.
 */

const SESSION_KEY = "designforge_anonymous_session";
const PROJECT_KEY = "designforge_anonymous_project";

export interface AnonymousSession {
  id: string;
  createdAt: string;
  lastActiveAt: string;
}

export interface LocalProject {
  html: string;
  prompt: string;
  conversationHistory: Array<{ role: string; content: string }>;
  updatedAt: string;
}

/**
 * Generate a unique session ID
 */
function generateSessionId(): string {
  // Use crypto.randomUUID if available, otherwise fallback
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  // Fallback for older browsers
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * Get or create an anonymous session
 * Returns null if localStorage is not available (SSR)
 */
export function getOrCreateSession(): AnonymousSession | null {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const stored = localStorage.getItem(SESSION_KEY);
    if (stored) {
      const session = JSON.parse(stored) as AnonymousSession;
      // Update last active time
      session.lastActiveAt = new Date().toISOString();
      localStorage.setItem(SESSION_KEY, JSON.stringify(session));
      return session;
    }

    // Create new session
    const session: AnonymousSession = {
      id: generateSessionId(),
      createdAt: new Date().toISOString(),
      lastActiveAt: new Date().toISOString(),
    };
    localStorage.setItem(SESSION_KEY, JSON.stringify(session));
    return session;
  } catch (error) {
    console.warn("Failed to access localStorage for session:", error);
    return null;
  }
}

/**
 * Get current session ID (doesn't create new one)
 */
export function getSessionId(): string | null {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const stored = localStorage.getItem(SESSION_KEY);
    if (stored) {
      const session = JSON.parse(stored) as AnonymousSession;
      return session.id;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Clear the anonymous session
 * Called when user signs up/in to prevent lingering data
 */
export function clearSession(): void {
  if (typeof window === "undefined") {
    return;
  }

  try {
    localStorage.removeItem(SESSION_KEY);
    localStorage.removeItem(PROJECT_KEY);
  } catch (error) {
    console.warn("Failed to clear session:", error);
  }
}

/**
 * Save project locally (as backup for Redis storage)
 */
export function saveLocalProject(project: LocalProject): void {
  if (typeof window === "undefined") {
    return;
  }

  try {
    localStorage.setItem(PROJECT_KEY, JSON.stringify(project));
  } catch (error) {
    console.warn("Failed to save local project:", error);
  }
}

/**
 * Get locally saved project
 */
export function getLocalProject(): LocalProject | null {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const stored = localStorage.getItem(PROJECT_KEY);
    if (stored) {
      return JSON.parse(stored) as LocalProject;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Clear locally saved project
 */
export function clearLocalProject(): void {
  if (typeof window === "undefined") {
    return;
  }

  try {
    localStorage.removeItem(PROJECT_KEY);
  } catch (error) {
    console.warn("Failed to clear local project:", error);
  }
}

/**
 * Save anonymous project to Redis via API
 * Supports multiple projects per session (up to 5)
 * If projectId is provided, updates that project. Otherwise creates new.
 */
export async function saveAnonymousProject(
  html: string,
  prompt: string,
  conversationHistory: Array<{ role: string; content: string }>,
  projectId?: string
): Promise<{ success: boolean; sessionId?: string; projectId?: string; expiresAt?: string; error?: string }> {
  const session = getOrCreateSession();
  if (!session) {
    return { success: false, error: "Could not create session" };
  }

  // Also save locally as backup (stores the most recent project)
  saveLocalProject({
    html,
    prompt,
    conversationHistory,
    updatedAt: new Date().toISOString(),
  });

  try {
    const response = await fetch("/api/anonymous-project", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sessionId: session.id,
        projectId, // If provided, updates existing project
        html,
        prompt,
        conversationHistory,
      }),
    });

    const data = await response.json();
    
    if (!response.ok) {
      return { success: false, error: data.error || "Failed to save" };
    }

    return {
      success: true,
      sessionId: session.id,
      projectId: data.projectId,
      expiresAt: data.expiresAt,
    };
  } catch (error) {
    console.error("Failed to save anonymous project:", error);
    return { success: false, error: "Network error" };
  }
}

export interface AnonymousProjectData {
  projectId: string;
  html: string;
  prompt: string;
  conversationHistory: Array<{ role: string; content: string }>;
  createdAt?: string;
  updatedAt?: string;
}

/**
 * Load a specific anonymous project from Redis via API
 * If no projectId provided, returns the most recent project (for backward compatibility)
 */
export async function loadAnonymousProject(projectId?: string): Promise<{
  success: boolean;
  project?: AnonymousProjectData;
  expiresAt?: string;
  error?: string;
}> {
  const sessionId = getSessionId();
  if (!sessionId) {
    // Try local backup
    const local = getLocalProject();
    if (local) {
      return {
        success: true,
        project: {
          projectId: "local",
          html: local.html,
          prompt: local.prompt,
          conversationHistory: local.conversationHistory,
        },
      };
    }
    return { success: false, error: "No session found" };
  }

  try {
    let url = `/api/anonymous-project?sessionId=${encodeURIComponent(sessionId)}`;
    if (projectId) {
      url += `&projectId=${encodeURIComponent(projectId)}`;
    }
    
    const response = await fetch(url);
    const data = await response.json();

    if (!response.ok) {
      // Fallback to local storage
      const local = getLocalProject();
      if (local) {
        return {
          success: true,
          project: {
            projectId: "local",
            html: local.html,
            prompt: local.prompt,
            conversationHistory: local.conversationHistory,
          },
        };
      }
      return { success: false, error: data.error || "Project not found" };
    }

    // If single project requested
    if (projectId || data.project) {
      return {
        success: true,
        project: data.project,
        expiresAt: data.expiresAt,
      };
    }

    // If multiple projects returned, return the most recent one
    if (data.projects && data.projects.length > 0) {
      return {
        success: true,
        project: data.projects[0], // Already sorted by updatedAt desc
        expiresAt: data.expiresAt,
      };
    }

    return { success: false, error: "No projects found" };
  } catch (error) {
    // Fallback to local storage on network error
    const local = getLocalProject();
    if (local) {
      return {
        success: true,
        project: {
          projectId: "local",
          html: local.html,
          prompt: local.prompt,
          conversationHistory: local.conversationHistory,
        },
      };
    }
    console.error("Failed to load anonymous project:", error);
    return { success: false, error: "Network error" };
  }
}

/**
 * Load ALL anonymous projects from Redis via API
 */
export async function loadAllAnonymousProjects(): Promise<{
  success: boolean;
  projects?: AnonymousProjectData[];
  expiresAt?: string;
  error?: string;
}> {
  const sessionId = getSessionId();
  if (!sessionId) {
    // Try local backup - return as single project array
    const local = getLocalProject();
    if (local) {
      return {
        success: true,
        projects: [{
          projectId: "local",
          html: local.html,
          prompt: local.prompt,
          conversationHistory: local.conversationHistory,
        }],
      };
    }
    return { success: false, error: "No session found" };
  }

  try {
    const response = await fetch(`/api/anonymous-project?sessionId=${encodeURIComponent(sessionId)}`);
    const data = await response.json();

    if (!response.ok) {
      // Fallback to local storage
      const local = getLocalProject();
      if (local) {
        return {
          success: true,
          projects: [{
            projectId: "local",
            html: local.html,
            prompt: local.prompt,
            conversationHistory: local.conversationHistory,
          }],
        };
      }
      return { success: false, error: data.error || "Projects not found" };
    }

    return {
      success: true,
      projects: data.projects || [],
      expiresAt: data.expiresAt,
    };
  } catch (error) {
    // Fallback to local storage on network error
    const local = getLocalProject();
    if (local) {
      return {
        success: true,
        projects: [{
          projectId: "local",
          html: local.html,
          prompt: local.prompt,
          conversationHistory: local.conversationHistory,
        }],
      };
    }
    console.error("Failed to load anonymous projects:", error);
    return { success: false, error: "Network error" };
  }
}

/**
 * Check if there's a pending anonymous project to migrate
 */
export function hasPendingProject(): boolean {
  return getSessionId() !== null || getLocalProject() !== null;
}

