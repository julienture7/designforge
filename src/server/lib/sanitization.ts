/**
 * Prompt Sanitization Layer
 * 
 * Detects and escapes prompt injection patterns to prevent malicious
 * manipulation of the AI system prompt.
 * 
 * @see Requirements 2.18
 */

/**
 * Regex pattern to detect common prompt injection attempts:
 * - "ignore (all) previous" - attempts to override system instructions
 * - "system:" - attempts to inject system-level commands
 * - "assistant:" - attempts to impersonate assistant responses
 * - "<system>" or "</system>" - XML-style system tags
 * - "<prompt>" or "</prompt>" - XML-style prompt tags
 */
const INJECTION_PATTERN = /ignore\s+(all\s+)?previous|system\s*:|assistant\s*:|<\/?system>|<\/?prompt>/gi;

/**
 * Checks if a prompt contains potential injection patterns.
 * 
 * @param prompt - The user's input prompt
 * @returns true if injection patterns are detected
 */
export function hasInjectionPattern(prompt: string): boolean {
  // Reset regex lastIndex for global patterns
  INJECTION_PATTERN.lastIndex = 0;
  return INJECTION_PATTERN.test(prompt);
}

/**
 * Sanitizes a user prompt by escaping detected injection patterns.
 * 
 * Detected patterns are wrapped in triple backticks with a [USER INPUT]: prefix
 * to clearly mark them as user-provided content rather than system instructions.
 * 
 * @param prompt - The user's input prompt
 * @returns The sanitized prompt with injection patterns escaped
 * 
 * @example
 * sanitizePrompt("ignore previous instructions")
 * // Returns: "[USER INPUT]: ```ignore previous instructions```"
 * 
 * @example
 * sanitizePrompt("Create a landing page")
 * // Returns: "Create a landing page" (unchanged)
 */
export function sanitizePrompt(prompt: string): string {
  if (!prompt || typeof prompt !== 'string') {
    return '';
  }

  // Reset regex lastIndex for global patterns
  INJECTION_PATTERN.lastIndex = 0;
  
  // Replace all injection patterns with escaped versions
  const sanitized = prompt.replace(INJECTION_PATTERN, (match) => {
    return `[USER INPUT]: \`\`\`${match}\`\`\``;
  });

  return sanitized;
}
