export interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
  metadata?: Record<string, any>;
}

export interface Conversation {
  id: string;
  title: string;
  messages: Message[];
  projectId?: string;
  createdAt: number;
  updatedAt: number;
}

export interface Memory {
  id: string;
  conversationId: string;
  content: string;
  importance: number;
  tags: string[];
  createdAt: number;
}

export interface ProjectPlan {
  id: string;
  title: string;
  description: string;
  steps: ProjectStep[];
  status: 'pending' | 'in-progress' | 'completed' | 'failed';
  createdAt: number;
  updatedAt: number;
}

export interface ProjectStep {
  id: string;
  description: string;
  status: 'pending' | 'in-progress' | 'completed' | 'failed';
  output?: string;
  error?: string;
}

export interface CopilotCommand {
  prompt: string;
  yolo: boolean;
  workingDirectory?: string;
  sessionId?: string;
}

export interface CopilotResponse {
  success: boolean;
  output: string;
  error?: string;
  exitCode: number;
  sessionId?: string;
  aborted?: boolean;
}

export interface VoiceCommand {
  transcript: string;
  confidence: number;
  timestamp: number;
}

export interface SocketEvents {
  // Client to Server
  'voice:command': (command: VoiceCommand) => void;
  'copilot:execute': (command: CopilotCommand) => void;
  'copilot:abort': () => void;
  'conversation:save': (conversation: Conversation) => void;
  'conversation:load': (id: string) => void;
  'memory:search': (query: string) => void;
  
  // Server to Client
  'copilot:output': (data: { chunk: string; type: 'stdout' | 'stderr' }) => void;
  'copilot:complete': (response: CopilotResponse) => void;
  'copilot:error': (error: string) => void;
  'conversation:loaded': (conversation: Conversation) => void;
  'memory:results': (memories: Memory[]) => void;
  'connection:status': (status: 'connected' | 'disconnected') => void;
}
