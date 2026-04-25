export type MessageRole = 'user' | 'assistant' | 'system';
export type ProjectStatus = 'pending' | 'in-progress' | 'completed' | 'failed';

export interface Message {
  id: string;
  role: MessageRole;
  content: string;
  timestamp: number;
  metadata?: Record<string, unknown>;
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

export interface ProjectStep {
  id: string;
  description: string;
  status: ProjectStatus;
  output?: string;
  error?: string;
}

export interface ProjectPlan {
  id: string;
  title: string;
  description: string;
  steps: ProjectStep[];
  status: ProjectStatus;
  createdAt: number;
  updatedAt: number;
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
}

export interface VoiceCommand {
  transcript: string;
  confidence: number;
  timestamp: number;
}

export interface RuntimeSummary {
  startedAt: number;
  databasePath: string;
  copilotCommand: string;
  copilotAvailable: boolean;
  copilotVersion?: string;
  frontendOrigin: string;
  academicPptBaseUrl: string;
  conversationCount: number;
  memoryCount: number;
  projectPlanCount: number;
}

export interface AppState {
  conversations: Conversation[];
  memories: Memory[];
  activePlan: ProjectPlan | null;
  runtime: RuntimeSummary;
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
  'plan:update': (plan: ProjectPlan | null) => void;
  'connection:status': (status: 'connected' | 'disconnected') => void;
}
