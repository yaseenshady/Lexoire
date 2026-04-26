export type MessageRole = 'user' | 'assistant' | 'system';
export type ProjectStatus = 'pending' | 'in-progress' | 'completed' | 'failed';
export type SessionStatus = 'idle' | 'thinking' | 'active' | 'paused' | 'completed';

export interface Message {
  id: string;
  role: MessageRole;
  content: string;
  timestamp: number;
  metadata?: Record<string, unknown>;
}

export interface Session {
  id: string;
  name: string;
  copilotSessionId: string;
  repoPath: string;
  branch?: string;
  status: SessionStatus;
  objective?: string;
  lastSummary?: string;
  focusLevel: number;
  metadata?: Record<string, unknown>;
  createdAt: number;
  updatedAt: number;
}

export interface SessionMessage {
  id: number;
  fromSessionId: string;
  toSessionId: string;
  message: string;
  createdAt: number;
}

export interface SessionContextShare {
  id: number;
  fromSessionId: string;
  toSessionId: string;
  context: Record<string, unknown>;
  contextType: 'objective' | 'summary' | 'metadata' | 'custom';
  createdAt: number;
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
  workingDirectory: string;
  copilotCommand: string;
  copilotAvailable: boolean;
  copilotVersion?: string;
  sessionId?: string;
  frontendOrigin: string;
  academicPptBaseUrl: string;
  conversationCount: number;
  memoryCount: number;
  projectPlanCount: number;
  sessionCount: number;
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
  'voice:routing': (data: { transcript: string; confidence: number; timestamp: number; sessionId?: string; routing?: any }) => void;
  'copilot:execute': (command: CopilotCommand) => void;
  'copilot:abort': () => void;
  'conversation:save': (conversation: Conversation) => void;
  'conversation:load': (id: string) => void;
  'memory:search': (query: string) => void;

  // Session events - Client to Server
  'session:create': (data: { name: string; repo_path: string; objective?: string; branch?: string }) => void;
  'session:switch': (data: { id: string }) => void;
  'session:pause': (data: { id: string }) => void;
  'session:resume': (data: { id: string }) => void;
  'session:close': (data: { id: string }) => void;
  'session:list-request': () => void;

  // Server to Client
  'copilot:output': (data: { chunk: string; type: 'stdout' | 'stderr' }) => void;
  'copilot:complete': (response: CopilotResponse) => void;
  'copilot:error': (error: string) => void;
  'conversation:loaded': (conversation: Conversation) => void;
  'memory:results': (memories: Memory[]) => void;
  'plan:update': (plan: ProjectPlan | null) => void;
  'connection:status': (status: 'connected' | 'disconnected') => void;

  // Session events - Server to Client
  'session:created': (data: { id: string; session: Session }) => void;
  'session:list': (data: { sessions: Session[]; current?: string }) => void;
  'session:switched': (data: { id: string; session: Session }) => void;
  'session:status-changed': (data: { id: string; status: SessionStatus }) => void;
  'session:updated': (data: { id: string; session: Session }) => void;
  'session:message': (data: { from: string; to: string; message: string }) => void;
  'session:context-shared': (data: { from: string; to: string; contextType: string; context: Record<string, unknown> }) => void;
}
