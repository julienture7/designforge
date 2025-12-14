import { z } from "zod";
import { conversationMessageSchema } from "./common";

/**
 * Zod validation schema for generation input
 * Uses .strict() mode to reject unknown keys
 * 
 * @see Requirements 2.16, 8.1, 8.2
 */
export const generateInputSchema = z.object({
  projectId: z.string().cuid().optional(),
  prompt: z
    .string()
    .trim()
    .min(1, "Prompt cannot be empty")
    .max(10000, "Prompt exceeds maximum length of 10,000 characters"),
  conversationHistory: z
    .array(conversationMessageSchema)
    .optional()
    .default([]),
}).strict();

export type GenerateInput = z.infer<typeof generateInputSchema>;

/**
 * Zod validation schema for resume generation input
 * Uses .strict() mode to reject unknown keys
 * 
 * @see Requirements 8.1
 */
export const resumeGenerationInputSchema = z.object({
  projectId: z.string().cuid(),
}).strict();

export type ResumeGenerationInput = z.infer<typeof resumeGenerationInputSchema>;
