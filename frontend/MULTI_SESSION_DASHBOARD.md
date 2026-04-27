# Multi-Session UI Dashboard - Implementation Guide

## Overview

The new multi-session UI components provide a sophisticated dashboard layout for managing multiple Lexoire sessions. This layout structure allows users to view, switch between, and manage multiple concurrent orchestrator sessions with visual status indicators and smooth animations.

## Components Created

### 1. **SessionCard.tsx**
Individual session display component shown in the left sidebar.

**Features:**
- Clickable card that shows session name, status, and last command
- Color-coded by session status (idle, thinking, active, paused, completed)
- Active indicator with glowing animation
- Compact and expanded modes
- Close button for session removal
- Command history display

**Props:**
```typescript
interface SessionCardProps {
  session: Session;
  isActive: boolean;
  onClick: (sessionId: string) => void;
  onClose?: (sessionId: string) => void;
  compact?: boolean;
}
```

**Styling:**
- Status colors: Neon cyan (active), Neon purple (thinking), Orange (paused), Green (completed), White (idle)
- Glassmorphic background with borders
- Smooth hover and tap animations
- Glowing indicator for active session

### 2. **SessionTabs.tsx**
Left sidebar component containing scrollable session list.

**Features:**
- Displays all sessions as clickable tabs
- Scrollable container with up/down arrow buttons
- Session counter badge
- "New Session" button at bottom
- Auto-expand scroll area when needed
- Smooth animations for session switching

**Props:**
```typescript
interface SessionTabsProps {
  sessions: Session[];
  activeSessionId: string;
  onSessionSelect: (sessionId: string) => void;
  onSessionClose?: (sessionId: string) => void;
  onNewSession?: () => void;
  compact?: boolean;
}
```

**Styling:**
- Full glassmorphic panel
- Scroll indicators (up/down arrows)
- Dashed border button for new session
- Neon cyan accents
- Smooth scrolling with custom scrollbar

### 3. **SessionMaster.tsx**
Top bar component with orchestrator controls.

**Features:**
- Shows active session name and orchestrator status
- Connection status indicator with color-coded state
- Active sessions counter
- Processing state animations
- Settings button integration
- Optional VoiceOrb placement
- Extended info bar (when not in compact mode)

**Props:**
```typescript
interface SessionMasterProps {
  activeSessionName: string;
  isConnected: boolean;
  isExecuting: boolean;
  totalSessions: number;
  activeSessions: number;
  onSettings?: () => void;
  onStatusClick?: () => void;
  voiceOrbElement?: React.ReactNode;
  compactMode?: boolean;
}
```

**Styling:**
- Rotating orchestrator icon when executing
- Color-coded status (connected/disconnected/executing)
- Glowing status indicator
- Responsive layout that adjusts to compact mode
- Real-time connection and execution state display

### 4. **MultiSessionDashboard.tsx**
Main layout container combining all components.

**Features:**
- Full-screen responsive layout
- Master controls at top
- Session tabs on left side
- Current session content in main area
- Smooth transitions between sessions
- Toggle visibility of master/tabs
- Responsive grid layout

**Props:**
```typescript
interface MultiSessionDashboardProps {
  sessions: Session[];
  activeSessionId: string;
  onSessionSelect: (sessionId: string) => void;
  onSessionClose?: (sessionId: string) => void;
  onNewSession?: () => void;
  onSettings?: () => void;
  onStatusClick?: () => void;
  isConnected: boolean;
  isExecuting: boolean;
  children?: ReactNode;
  voiceOrbElement?: ReactNode;
  compactMode?: boolean;
  showMaster?: boolean;
  showTabs?: boolean;
}
```

**Layout Structure:**
```
┌─────────────────────────────────────────────┐
│         SessionMaster (Top Bar)             │
├──────────────┬──────────────────────────────┤
│              │                              │
│  SessionTabs │    Current Session Content   │
│              │    (ConversationPanel +      │
│  (Sessions   │     TerminalOutput)          │
│   List)      │                              │
│              │                              │
└──────────────┴──────────────────────────────┘
```

## Session Status Indicators

Each session displays a visual status indicator:

- **Idle** (⏸️ Gray): Session is paused or idle
- **Thinking** (🤔 Purple): Session is processing a response
- **Active** (⚡ Cyan): Session is actively listening/executing
- **Paused** (⏸️ Orange): Session is temporarily paused
- **Completed** (✅ Green): Session task completed

## Styling & Theme

### Colors Used
- **Neon Cyan**: Primary active color (#00FFFF)
- **Neon Purple**: Thinking/processing state (#BF00FF)
- **Neon Pink**: Secondary accent (if used)
- **Orange**: Warning/paused state
- **Green**: Success/completed state

### Effects
- **Glassmorphism**: Semi-transparent panels with backdrop blur
- **Glow Effects**: Neon glow around active indicators
- **Smooth Animations**: Framer-motion transitions for all interactions
- **Responsive Design**: Adjusts layout for different screen sizes

## Integration with Existing Components

### VoiceOrb Integration
The VoiceOrb component can be passed as `voiceOrbElement` to SessionMaster:
```jsx
<MultiSessionDashboard
  voiceOrbElement={<VoiceOrb state={voiceState} {...props} />}
  {...otherProps}
/>
```

### ConversationPanel & TerminalOutput
These components become children of the dashboard:
```jsx
<MultiSessionDashboard {...props}>
  <div className="flex-1 grid grid-rows-2 gap-4">
    <ConversationPanel {...props} />
    <TerminalOutput {...props} />
  </div>
</MultiSessionDashboard>
```

### Settings & Notifications
- SettingsPanel remains at the app root level
- NotificationManager remains unchanged
- SessionMaster triggers settings via callback

## Usage Examples

### Basic Implementation
```typescript
import { MultiSessionDashboard } from './components/MultiSessionDashboard';
import type { Session } from './types';

function App() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [activeSessionId, setActiveSessionId] = useState('');

  return (
    <MultiSessionDashboard
      sessions={sessions}
      activeSessionId={activeSessionId}
      onSessionSelect={setActiveSessionId}
      onNewSession={handleCreateSession}
      isConnected={isConnected}
      isExecuting={isExecuting}
    >
      <ConversationPanel {...props} />
      <TerminalOutput {...props} />
    </MultiSessionDashboard>
  );
}
```

### Compact Mode
For smaller screens or sidebars:
```jsx
<MultiSessionDashboard
  compactMode={true}
  {...props}
/>
```

### Selective Component Display
```jsx
<MultiSessionDashboard
  showMaster={true}
  showTabs={true}
  {...props}
/>
```

## State Management Integration

### Socket Events to Handle
- `session:created` - New session created
- `session:updated` - Session properties changed
- `session:status-changed` - Session status updated
- `session:switched` - Active session switched
- `session:paused` - Session paused
- `session:resumed` - Session resumed

### Recommended State Structure
```typescript
const [sessions, setSessions] = useState<Session[]>([]);
const [activeSessionId, setActiveSessionId] = useState<string>('');

// Listen to socket events
useEffect(() => {
  socket.on('session:created', (session: Session) => {
    setSessions(prev => [...prev, session]);
  });

  socket.on('session:updated', (updatedSession: Session) => {
    setSessions(prev =>
      prev.map(s => s.id === updatedSession.id ? updatedSession : s)
    );
  });

  socket.on('session:status-changed', (data) => {
    setSessions(prev =>
      prev.map(s =>
        s.id === data.sessionId
          ? { ...s, status: data.status }
          : s
      )
    );
  });

  return () => {
    socket.off('session:created');
    socket.off('session:updated');
    socket.off('session:status-changed');
  };
}, [socket]);
```

## Responsive Behavior

### Desktop (1024px+)
- Full 3-column layout: Master (full width), Tabs (25%), Content (75%)
- Expanded SessionCard display with all details
- Non-compact mode

### Tablet (768px - 1023px)
- Master (full width), Tabs (30%), Content (70%)
- Slightly condensed SessionCard

### Mobile (< 768px)
- Stacked layout: Master, then Tabs, then Content
- Compact mode SessionCards
- Collapsed view options

## Performance Considerations

1. **Session List Virtualization**: For apps with 100+ sessions, consider using react-window
2. **Scroll Optimization**: ScrollContainer uses passive listeners
3. **Animation Performance**: Framer-motion uses GPU-accelerated transforms
4. **Re-render Optimization**: Use memoization for session cards in large lists

## Accessibility

- Keyboard navigation support (arrow keys for session switching)
- ARIA labels on interactive elements
- High contrast text on glassmorphic backgrounds
- Focus visible indicators
- Semantic HTML structure

## Future Enhancements

1. **Session Groups**: Organize sessions into categories
2. **Favorites**: Pin frequently used sessions
3. **Session History**: Show recent sessions separate from active
4. **Drag & Drop**: Reorder sessions
5. **Session Search**: Filter sessions by name/status
6. **Multi-select**: Batch operations on sessions
7. **Export/Import**: Save and restore session configurations

## Files Created

- `src/components/SessionCard.tsx` - Individual session display
- `src/components/SessionTabs.tsx` - Session list sidebar
- `src/components/SessionMaster.tsx` - Top orchestrator bar
- `src/components/MultiSessionDashboard.tsx` - Main layout container
- `src/components/index.ts` - Barrel export file
- `src/MULTI_SESSION_INTEGRATION.md` - Integration examples
- `MULTI_SESSION_DASHBOARD.md` - This documentation file

## Build & Testing

All components:
- ✅ TypeScript validated
- ✅ Successfully compiled (npm run build)
- ✅ Production-ready CSS (Tailwind + Framer Motion)
- ✅ Responsive design tested
- ✅ Accessibility checked

## Conclusion

The new multi-session UI dashboard provides a professional, responsive interface for managing multiple Lexoire orchestration sessions. The modular component design allows for flexible integration with existing application components while maintaining consistent styling and animations throughout the application.
