/**
 * Editor Types
 * 
 * Type definitions for the editor interface components.
 */

/**
 * Conversation message structure for AI chat history.
 */
export interface ConversationMessage {
  role: 'user' | 'model';
  content: string;
}

/**
 * AESTHETIC_DNA metadata extracted from AI-generated HTML.
 */
export interface AestheticDNA {
  name: string;
  keywords: string[];
  palette: string[];
  typography: string[];
}

/**
 * Stream event types for AI generation.
 */
export interface StreamEvent {
  type: 'metadata' | 'content' | 'status' | 'error' | 'complete';
  data?: AestheticDNA | string;
  code?: string;
  message?: string;
}

/**
 * Message types sent from iframe to parent window.
 */
export type IframeMessageType = 'IFRAME_ERROR' | 'IFRAME_READY';

/**
 * Error details from iframe.
 */
export interface IframeErrorDetails {
  message: string;
  line?: number;
  col?: number;
}

/**
 * Message structure for iframe-to-parent communication.
 */
export interface IframeMessage {
  type: IframeMessageType;
  error?: IframeErrorDetails;
}

/**
 * Type guard to check if a message is a valid IframeMessage.
 */
export function isIframeMessage(data: unknown): data is IframeMessage {
  if (typeof data !== 'object' || data === null) {
    return false;
  }
  
  const msg = data as Record<string, unknown>;
  return (
    typeof msg.type === 'string' &&
    (msg.type === 'IFRAME_ERROR' || msg.type === 'IFRAME_READY')
  );
}

/**
 * Type guard to check if an IframeMessage is an error message.
 */
export function isIframeErrorMessage(msg: IframeMessage): msg is IframeMessage & { type: 'IFRAME_ERROR'; error: IframeErrorDetails } {
  return msg.type === 'IFRAME_ERROR' && msg.error !== undefined;
}
