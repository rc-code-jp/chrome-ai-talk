export type ChatRole = 'user' | 'assistant';

export type ChatStatus = 'idle' | 'waiting-input' | 'streaming' | 'sync-error';

export interface ChatMessage {
  id: string;
  role: ChatRole;
  text: string;
  isStreaming: boolean;
}

export interface ChatState {
  messages: ChatMessage[];
  status: ChatStatus;
  composerAvailable: boolean;
  syncError: string | null;
  overlayEnabled: boolean;
}
