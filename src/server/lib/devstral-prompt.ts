/**
 * Devstral Prompt Loader
 * 
 * Loads the Devstral prompt from the text file and replaces {brief} with the user's prompt.
 */

import { readFileSync } from "fs";
import { join } from "path";

let cachedPrompt: string | null = null;

/**
 * Load the Devstral prompt from the file system.
 * The prompt is cached after first load for performance.
 */
export function loadDevstralPrompt(): string {
  if (cachedPrompt) {
    return cachedPrompt;
  }

  // Read the prompt file from the project root
  const promptPath = join(process.cwd(), "Devstral prompt.txt");
  cachedPrompt = readFileSync(promptPath, "utf-8");
  
  return cachedPrompt;
}

/**
 * Get the Devstral system prompt with the user's brief inserted.
 * 
 * @param brief - The user's prompt/brief to insert into the system prompt
 * @returns The complete system prompt with {brief} replaced
 */
export function getDevstralSystemPrompt(brief: string): string {
  const basePrompt = loadDevstralPrompt();
  return basePrompt.replace("{brief}", brief);
}
