/**
 * INTEGRATION GUIDE: Multi-Session Dashboard
 * 
 * This guide shows how to integrate the new multi-session UI components
 * into the existing JARVIS application.
 * 
 * Components:
 * - MultiSessionDashboard: Main layout container
 * - SessionTabs: Left sidebar with session list
 * - SessionMaster: Top bar with orchestrator controls
 * - SessionCard: Individual session display
 */

import type { Session } from './types';
import {
  MultiSessionDashboard,
  SessionTabs,
  SessionMaster,
} from './components/MultiSessionDashboard';
import { SessionCard } from './components/SessionCard';

/**
 * EXAMPLE 1: Basic Usage with MultiSessionDashboard
 * 
 * Replace the main grid layout in App.tsx with the MultiSessionDashboard
 */
export function ExampleBasicUsage() {
  // State management
  const sessions: Session[] = [
    {
      id: 'session-1',
      name: 'Project Setup',
      status: 'active',
      objective: 'Configure build environment',
      lastCommand: 'npm install',
      createdAt: Date.now() - 1000000,
      updatedAt: Date.now(),
      isListening: false,
      commandHistory: [
        { command: 'npm install', timestamp: Date.now() - 10000 }
      ],
      priority: 1
    },
    {
      id: 'session-2',
      name: 'Testing',
      status: 'idle',
      objective: 'Run test suite',
      lastCommand: 'npm test',
      createdAt: Date.now() - 500000,
      updatedAt: Date.now(),
      isListening: false,
      commandHistory: [],
      priority: 2
    }
  ];

  const activeSessionId = 'session-1';
  const isConnected = true;
  const isExecuting = false;

  const handleSessionSelect = (sessionId: string) => {
    console.log('Switching to session:', sessionId);
    // Update activeSessionId state
  };

  const handleNewSession = () => {
    console.log('Creating new session');
    // Create and switch to new session
  };

  return (
    <MultiSessionDashboard
      sessions={sessions}
      activeSessionId={activeSessionId}
      onSessionSelect={handleSessionSelect}
      onNewSession={handleNewSession}
      onSettings={() => console.log('Settings clicked')}
      onStatusClick={() => console.log('Status clicked')}
      isConnected={isConnected}
      isExecuting={isExecuting}
      showMaster={true}
      showTabs={true}
    >
      {/* Current session content here - ConversationPanel, TerminalOutput, etc. */}
      <div className="glass-panel p-6">Session content</div>
    </MultiSessionDashboard>
  );
}

/**
 * EXAMPLE 2: Standalone SessionTabs Component
 * 
 * Use SessionTabs independently in your layout
 */
export function ExampleSessionTabs() {
  const sessions: Session[] = [];
  const activeSessionId = '';

  return (
    <SessionTabs
      sessions={sessions}
      activeSessionId={activeSessionId}
      onSessionSelect={(id) => console.log('Selected:', id)}
      onNewSession={() => console.log('New session')}
      compact={false}
    />
  );
}

/**
 * EXAMPLE 3: Standalone SessionMaster Component
 * 
 * Use SessionMaster independently as a top bar
 */
export function ExampleSessionMaster() {
  return (
    <SessionMaster
      activeSessionName="Current Project"
      isConnected={true}
      isExecuting={false}
      totalSessions={3}
      activeSessions={1}
      onSettings={() => console.log('Settings')}
      onStatusClick={() => console.log('Status clicked')}
      compactMode={false}
    />
  );
}

/**
 * EXAMPLE 4: Standalone SessionCard Component
 * 
 * Display individual sessions or custom session lists
 */
export function ExampleSessionCard() {
  const session: Session = {
    id: 'demo-1',
    name: 'Demo Session',
    status: 'active',
    createdAt: Date.now(),
    updatedAt: Date.now(),
    isListening: false,
    commandHistory: [],
    priority: 1
  };

  return (
    <SessionCard
      session={session}
      isActive={true}
      onClick={(id) => console.log('Clicked:', id)}
      onClose={(id) => console.log('Closed:', id)}
      compact={false}
    />
  );
}

/**
 * INTEGRATION STEPS:
 * 
 * 1. Import the components in App.tsx:
 *    import { MultiSessionDashboard } from './components/MultiSessionDashboard';
 *    import type { Session } from './types';
 * 
 * 2. Add session state management:
 *    const [sessions, setSessions] = useState<Session[]>([]);
 *    const [activeSessionId, setActiveSessionId] = useState('');
 * 
 * 3. Replace the existing grid layout with MultiSessionDashboard:
 *    <MultiSessionDashboard
 *      sessions={sessions}
 *      activeSessionId={activeSessionId}
 *      onSessionSelect={setActiveSessionId}
 *      onNewSession={handleNewSession}
 *      isConnected={isConnected}
 *      isExecuting={isExecuting}
 *    >
 *      <ConversationPanel {...props} />
 *      <TerminalOutput {...props} />
 *    </MultiSessionDashboard>
 * 
 * 4. Handle session creation, switching, and management:
 *    - Listen to socket events: 'session:created', 'session:updated'
 *    - Emit socket events: 'session:create', 'session:switch'
 *    - Update local state to reflect session changes
 * 
 * 5. Wire up the existing components:
 *    - VoiceOrb can be passed as voiceOrbElement prop
 *    - SettingsPanel remains in the main App
 *    - ConversationPanel and TerminalOutput become children of the dashboard
 * 
 * STYLING NOTES:
 * - All components use Tailwind CSS with glassmorphism effects
 * - Theme colors: neon-cyan, neon-purple, neon-pink
 * - Animations use framer-motion for smooth transitions
 * - Responsive design: adjusts to screen size with compactMode prop
 * 
 * STATE MANAGEMENT TIPS:
 * - Session data flows from backend via socket events
 * - Local session cache prevents unnecessary re-renders
 * - Active session ID determines what content is displayed
 * - Session status drives visual indicators and UI state
 */

export default {
  ExampleBasicUsage,
  ExampleSessionTabs,
  ExampleSessionMaster,
  ExampleSessionCard
};
