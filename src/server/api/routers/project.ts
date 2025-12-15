/**
 * Project tRPC Router
 * 
 * Handles project CRUD operations with auto-save support.
 * 
 * Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, Concurrency Edge Cases
 */
import { TRPCError } from "@trpc/server";
import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
import { type VersionHistoryEntry } from "~/lib/validators/common";
import {
  projectListInputSchema,
  projectGetSchema,
  projectCreateSchema,
  projectUpdateSchema,
  projectDeleteSchema,
  generationCompleteSchema,
} from "~/lib/validators/project";

/**
 * Helper to parse and validate version history from JSON
 */
function parseVersionHistory(data: unknown): VersionHistoryEntry[] {
  if (!Array.isArray(data)) return [];
  
  return data.filter(
    (entry): entry is VersionHistoryEntry =>
      typeof entry === "object" &&
      entry !== null &&
      "html" in entry &&
      "timestamp" in entry &&
      typeof entry.html === "string" &&
      typeof entry.timestamp === "string"
  );
}

/**
 * Slice version history to max 10 entries (keep most recent)
 */
function sliceVersionHistory(history: VersionHistoryEntry[]): VersionHistoryEntry[] {
  if (history.length <= 10) return history;
  return history.slice(-10);
}

export const projectRouter = createTRPCRouter({
  /**
   * List projects with pagination
   * Excludes versionHistory and htmlContent to avoid massive payload sizes
   * 
   * Requirements: 5.2
   */
  list: protectedProcedure
    .input(projectListInputSchema)
    .query(async ({ ctx, input }) => {
      const { page, pageSize, visibility, query } = input;
      const skip = (page - 1) * pageSize;

      const where = {
        userId: ctx.user.id,
        ...(visibility ? { visibility } : {}),
        ...(query
          ? {
              title: {
                contains: query,
                mode: "insensitive" as const,
              },
            }
          : {}),
      };

      // Get total count for pagination
      const totalCount = await ctx.db.project.count({
        where,
      });

      // Query projects excluding heavy fields (versionHistory, htmlContent)
      const projects = await ctx.db.project.findMany({
        where,
        select: {
          id: true,
          title: true,
          visibility: true,
          status: true, // Include status to show generating indicator
          tokenUsage: true,
          generationCount: true,
          createdAt: true,
          updatedAt: true,
          // Explicitly EXCLUDE versionHistory and htmlContent
        },
        orderBy: { updatedAt: "desc" },
        skip,
        take: pageSize,
      });

      return {
        projects,
        pagination: {
          page,
          pageSize,
          totalCount,
          totalPages: Math.ceil(totalCount / pageSize),
          hasMore: skip + projects.length < totalCount,
        },
      };
    }),

  /**
   * Get a single project by ID
   * 
   * Requirements: 5.3
   */
  get: protectedProcedure
    .input(projectGetSchema)
    .query(async ({ ctx, input }) => {
      const project = await ctx.db.project.findUnique({
        where: { id: input.id },
        select: {
          id: true,
          userId: true,
          title: true,
          htmlContent: true,
          conversationHistory: true,
          visibility: true,
          tokenUsage: true,
          generationCount: true,
          versionHistory: true,
          createdAt: true,
          updatedAt: true,
        },
      });

      if (!project) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Project not found",
        });
      }

      // Check ownership or public visibility
      if (project.userId !== ctx.user.id && project.visibility !== "PUBLIC") {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "You don't have permission to access this resource",
        });
      }

      return project;
    }),

  /**
   * Create a new project
   * Sets visibility based on user tier (FREE=PUBLIC, PRO=PRIVATE)
   * 
   * Requirements: 5.1, 5.4, 5.5
   */
  create: protectedProcedure
    .input(projectCreateSchema)
    .mutation(async ({ ctx, input }) => {
      // Set visibility based on tier (FREE=PUBLIC, PRO=PRIVATE)
      const visibility = ctx.user.tier === "PRO" ? "PRIVATE" : "PUBLIC";

      const project = await ctx.db.project.create({
        data: {
          userId: ctx.user.id,
          title: input.title,
          htmlContent: input.htmlContent,
          conversationHistory: input.conversationHistory,
          visibility,
          status: input.status ?? "READY", // Default to READY, but allow GENERATING for new generations
          versionHistory: [],
        },
        select: {
          id: true,
          title: true,
          visibility: true,
          status: true,
          createdAt: true,
          updatedAt: true,
        },
      });

      return project;
    }),

  /**
   * Update project - used for auto-save
   * Handles versionHistory slicing to max 10 entries
   * Uses last write wins strategy for concurrent saves
   * 
   * Requirements: 5.1, 5.6, Concurrency Edge Cases
   */
  update: protectedProcedure
    .input(projectUpdateSchema)
    .mutation(async ({ ctx, input }) => {
      // Verify ownership and get current state
      const existingProject = await ctx.db.project.findUnique({
        where: { id: input.id },
        select: { 
          userId: true,
          versionHistory: true,
        },
      });

      if (!existingProject) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Project not found",
        });
      }

      if (existingProject.userId !== ctx.user.id) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "You don't have permission to access this resource",
        });
      }

      // Build update data
      const updateData: Record<string, unknown> = {};
      
      if (input.title !== undefined) {
        updateData.title = input.title;
      }
      
      if (input.conversationHistory !== undefined) {
        updateData.conversationHistory = input.conversationHistory;
      }
      
      if (input.tokenUsage !== undefined) {
        updateData.tokenUsage = input.tokenUsage;
      }
      
      if (input.visibility !== undefined) {
        updateData.visibility = input.visibility;
      }

      if (input.status !== undefined) {
        updateData.status = input.status;
      }

      // Handle htmlContent update with versionHistory management
      if (input.htmlContent !== undefined) {
        updateData.htmlContent = input.htmlContent;
        
        // Parse existing version history
        let versionHistory = parseVersionHistory(existingProject.versionHistory);
        
        // Append new version
        versionHistory.push({
          html: input.htmlContent,
          timestamp: new Date().toISOString(),
        });
        
        // Slice to max 10 entries (keep most recent)
        versionHistory = sliceVersionHistory(versionHistory);
        
        updateData.versionHistory = versionHistory;
      }

      // Last write wins strategy - no version check needed
      const project = await ctx.db.project.update({
        where: { id: input.id },
        data: updateData,
        select: {
          id: true,
          title: true,
          visibility: true,
          updatedAt: true,
        },
      });

      return project;
    }),

  /**
   * Delete a project
   * 
   * Requirements: 5.4
   */
  delete: protectedProcedure
    .input(projectDeleteSchema)
    .mutation(async ({ ctx, input }) => {
      // Verify ownership
      const existingProject = await ctx.db.project.findUnique({
        where: { id: input.id },
        select: { userId: true },
      });

      if (!existingProject) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Project not found",
        });
      }

      if (existingProject.userId !== ctx.user.id) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "You don't have permission to access this resource",
        });
      }

      await ctx.db.project.delete({
        where: { id: input.id },
      });

      return { success: true, id: input.id };
    }),

  /**
   * Handle generation complete
   * Increments generationCount and appends to versionHistory (max 10)
   * 
   * Requirements: 5.1
   */
  onGenerationComplete: protectedProcedure
    .input(generationCompleteSchema)
    .mutation(async ({ ctx, input }) => {
      // Verify ownership and get current versionHistory
      const existingProject = await ctx.db.project.findUnique({
        where: { id: input.id },
        select: { 
          userId: true, 
          versionHistory: true,
          generationCount: true,
        },
      });

      if (!existingProject) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Project not found",
        });
      }

      if (existingProject.userId !== ctx.user.id) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "You don't have permission to access this resource",
        });
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

      const project = await ctx.db.project.update({
        where: { id: input.id },
        data: {
          htmlContent: input.htmlContent,
          conversationHistory: input.conversationHistory,
          tokenUsage: input.tokenUsage,
          generationCount: { increment: 1 },
          versionHistory: versionHistory,
          status: "READY", // Mark as ready when generation completes
        },
        select: {
          id: true,
          generationCount: true,
          status: true,
          updatedAt: true,
        },
      });

      return project;
    }),
});
