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
  conversationCount: number;
  memoryCount: number;
  projectPlanCount: number;
  sessionCount?: number;
}

export interface AppState {
  conversations: Conversation[];
  memories: Memory[];
  activePlan: ProjectPlan | null;
  runtime: RuntimeSummary;
}

export interface FrontendSettings {
  voiceLang: string;
  voiceStyle: 'natural' | 'clear' | 'default';
  speechRate: number;
  speechPitch: number;
  speechVolume: number;
  autoSave: boolean;
  continuousListening: boolean;
  apiEndpoint: string;
  speakResponses: boolean;
}

export interface Session {
  id: string;
  name: string;
  status: SessionStatus;
  objective?: string;
  lastCommand?: string;
  lastSummary?: string;
  repo?: string;
  branch?: string;
  isListening: boolean;
  createdAt: number;
  updatedAt: number;
  commandHistory: Array<{
    command: string;
    timestamp: number;
    output?: string;
  }>;
  priority: number;
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
  'session:create': (session: Omit<Session, 'id' | 'createdAt' | 'updatedAt' | 'commandHistory'>) => void;
  'session:pause': (data: { sessionId: string; timestamp: number }) => void;
  'session:resume': (data: { sessionId: string; timestamp: number }) => void;
  'session:switch': (data: { toSessionId: string; timestamp: number }) => void;
  'session:broadcast': (data: { message: string; timestamp: number }) => void;

  // Server to Client
  'copilot:output': (data: { chunk: string; type: 'stdout' | 'stderr' }) => void;
  'copilot:complete': (response: CopilotResponse) => void;
  'copilot:error': (error: string) => void;
  'conversation:loaded': (conversation: Conversation) => void;
  'memory:results': (memories: Memory[]) => void;
  'plan:update': (plan: ProjectPlan | null) => void;
  'connection:status': (status: 'connected' | 'disconnected') => void;
  'session:status-changed': (data: { sessionId: string; status: SessionStatus }) => void;
  'session:updated': (session: Session) => void;
  'session:created': (session: Session) => void;
  'session:listening': (sessionId: string) => void;
  'session:paused': (data: { sessionId: string; timestamp: number }) => void;
  'session:resumed': (data: { sessionId: string; timestamp: number }) => void;
  'session:switched': (data: { toSessionId: string; fromSessionId?: string; timestamp: number }) => void;
}
