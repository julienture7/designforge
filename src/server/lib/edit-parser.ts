/**
 * Edit Parser - Utility functions for edit detection
 * 
 * Note: The search/replace block approach was replaced with full HTML output
 * for better reliability. These utilities remain for edit detection.
 */

/**
 * Detect if a user message is an edit request vs a new generation request
 * 
 * Simple logic: If HTML already exists, treat any follow-up as an edit.
 * The only exception is if the user explicitly asks for a completely new page.
 */
export function isEditRequest(message: string, hasExistingHtml: boolean): boolean {
  if (!hasExistingHtml) {
    return false;
  }

  const lowerMessage = message.toLowerCase();
  
  // Only treat as new generation if user explicitly asks for a fresh start
  const newGenerationKeywords = [
    "start over",
    "start fresh",
    "from scratch",
    "new website",
    "new page",
    "completely new",
    "brand new",
    "forget this",
    "discard this",
    "replace everything",
    "redo everything",
  ];
  
  const wantsNewGeneration = newGenerationKeywords.some(keyword => lowerMessage.includes(keyword));
  
  // If existing HTML and not explicitly asking for new generation → it's an edit
  return !wantsNewGeneration;
}

/**
 * Check if user wants a completely new design (strict detection)
 */
export function isNewDesignRequest(editInstruction: string): boolean {
  return /(?:start\s*over|start\s*fresh|from\s*scratch|completely\s*new|brand\s*new|discard\s*this|forget\s*this|new\s*website|new\s*page|replace\s*everything|redo\s*everything)/i.test(editInstruction);
}
