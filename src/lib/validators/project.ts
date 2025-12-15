import { z } from "zod";
import { 
  conversationMessageSchema, 
  paginationSchema, 
  visibilitySchema,
  cuidSchema,
} from "./common";

/**
 * Project status enum schema
 */
export const projectStatusSchema = z.enum(["GENERATING", "READY"]);

/**
 * Project Zod validation schemas
 * All schemas use .strict() mode to reject unknown keys
 * 
 * @see Requirements 8.1, 8.2
 */

/**
 * Project list input schema with pagination and optional visibility filter
 * Uses .strict() mode to reject unknown keys
 */
export const projectListInputSchema = paginationSchema.extend({
  visibility: visibilitySchema.optional(),
  query: z.string().trim().min(1).max(200).optional(),
}).strict();

export type ProjectListInput = z.infer<typeof projectListInputSchema>;

/**
 * Project get input schema
 * Uses .strict() mode to reject unknown keys
 */
export const projectGetSchema = z.object({
  id: cuidSchema,
}).strict();

export type ProjectGetInput = z.infer<typeof projectGetSchema>;

/**
 * Project create input schema
 * Uses .strict() mode to reject unknown keys
 */
export const projectCreateSchema = z.object({
  title: z.string().min(1, "Title is required").max(200, "Title exceeds maximum length of 200 characters"),
  htmlContent: z.string().default(""),
  conversationHistory: z.array(conversationMessageSchema).default([]),
  status: projectStatusSchema.optional(), // Allow setting initial status (GENERATING for new generations)
}).strict();

export type ProjectCreateInput = z.infer<typeof projectCreateSchema>;

/**
 * Project update input schema - used for auto-save functionality
 * Uses .strict() mode to reject unknown keys
 */
export const projectUpdateSchema = z.object({
  id: cuidSchema,
  title: z.string().min(1, "Title is required").max(200, "Title exceeds maximum length of 200 characters").optional(),
  htmlContent: z.string().optional(),
  conversationHistory: z.array(conversationMessageSchema).optional(),
  tokenUsage: z.number().int().min(0, "Token usage cannot be negative").optional(),
  visibility: visibilitySchema.optional(),
  status: projectStatusSchema.optional(), // Allow updating status (GENERATING -> READY)
}).strict();

export type ProjectUpdateInput = z.infer<typeof projectUpdateSchema>;

/**
 * Project delete input schema
 * Uses .strict() mode to reject unknown keys
 */
export const projectDeleteSchema = z.object({
  id: cuidSchema,
}).strict();

export type ProjectDeleteInput = z.infer<typeof projectDeleteSchema>;

/**
 * Generation complete input schema
 * Increments generationCount and appends to versionHistory
 * Uses .strict() mode to reject unknown keys
 */
export const generationCompleteSchema = z.object({
  id: cuidSchema,
  htmlContent: z.string(),
  conversationHistory: z.array(conversationMessageSchema),
  tokenUsage: z.number().int().min(0, "Token usage cannot be negative"),
}).strict();

export type GenerationCompleteInput = z.infer<typeof generationCompleteSchema>;
