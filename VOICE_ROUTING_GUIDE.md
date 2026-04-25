# Voice Routing System Documentation

## Overview

The voice routing system enables JARVIS to intelligently route voice commands to specific sessions or broadcast them to all active sessions. This enables multi-session coordination through voice commands.

## Components

### 1. useSessionRouter Hook

Core hook for parsing and routing voice commands to sessions.

#### Usage

```typescript
import { useSessionRouter } from '@/hooks/useSessionRouter';

const { 
  parseCommand, 
  routeToSession, 
  broadcastToAll,
  setActiveSession,
  getLastSession,
  rememberSession,
  updateAvailableSessions,
  executeRoute,
  currentSessionId,
  availableSessions 
} = useSessionRouter({
  onRouted: (route) => console.log('Route executed:', route),
  onSessionSwitched: (sessionId) => console.log('Switched to:', sessionId)
});
```

#### Core Methods

**parseCommand(transcript: string): CommandRoute**
- Parses a voice transcript to extract session routing information
- Returns a CommandRoute with target sessions and command to execute

**routeToSession(command: string, sessionId: string, socket?: Socket): Promise<void>**
- Routes a command to a specific session
- Emits routing info to backend via socket.io

**broadcastToAll(command: string, socket?: Socket): Promise<void>**
- Broadcasts a command to all available sessions
- Emits routing info to backend for distribution

**executeRoute(route: CommandRoute, socket?: Socket): Promise<void>**
- Executes a parsed command route
- Handles special commands like session-switch, pause, resume

**rememberSession(id: string): void**
- Stores a session as the last active session
- Used for quick returns to previously used sessions

**getLastSession(): string | null**
- Retrieves the last active session ID
- Returns null if no session history exists

**setActiveSession(sessionId: string | null): void**
- Sets the current active session
- Auto-remembers the session

**updateAvailableSessions(sessions: string[]): void**
- Updates the list of available sessions
- Used when sessions are created or destroyed

### 2. useVoiceRouting Hook

High-level integration of voice recognition with session routing.

#### Usage

```typescript
import { useVoiceRouting } from '@/hooks/useVoiceRouting';
import { useSocket } from '@/hooks/useSocket';

const { socket } = useSocket();
const {
  isListening,
  transcript,
  startListening,
  stopListening,
  currentSessionId,
  availableSessions,
  setActiveSession,
  manuallyRouteCommand
} = useVoiceRouting({
  socket,
  enableRouting: true,
  onRouteExecuted: (route) => console.log('Route:', route)
});
```

#### Features

- Automatically routes voice commands based on session context
- Remembers active session across commands
- Supports session switching via voice
- Handles confirmation before executing

## Supported Voice Commands

### 1. Switch Session

```
"switch to planning"
"switch to auth"
```

Routes to a specific session and makes it active.

### 2. Tell Command

```
"tell auth to fix login bug"
"tell backend to deploy service"
```

Routes a command to a specific session while providing context.

### 3. Broadcast

```
"broadcast: run all tests"
"broadcast to all: check status"
```

Sends a command to all active sessions simultaneously.

### 4. Pause Session

```
"pause planning"
"pause backend"
```

Pauses execution in a specific session.

### 5. Resume Session

```
"resume planning"
"resume backend"
```

Resumes execution in a paused session.

### 6. Send/Route

```
"send service-a deploy to production"
"route to frontend build assets"
```

Alternative routing syntax.

### 7. Default

```
"run tests"
"check logs"
```

If no routing prefix is detected:
- If in an active session: routes to that session
- If no active session: broadcasts to all sessions

## Implementation Example

```typescript
import { useVoiceRouting } from '@/hooks/useVoiceRouting';
import { useSocket } from '@/hooks/useSocket';

function VoiceCommandPanel() {
  const { socket } = useSocket();
  const {
    isListening,
    transcript,
    currentSessionId,
    availableSessions,
    startListening,
    stopListening,
    manuallyRouteCommand,
    lastRoute
  } = useVoiceRouting({ socket });

  return (
    <div>
      <button onClick={startListening} disabled={isListening}>
        {isListening ? 'Listening...' : 'Start Listening'}
      </button>
      
      <button onClick={stopListening} disabled={!isListening}>
        Stop Listening
      </button>

      <p>Transcript: {transcript}</p>
      <p>Active Session: {currentSessionId || 'None'}</p>
      <p>Available: {availableSessions.join(', ')}</p>
      
      {lastRoute && (
        <div>
          <p>Last Route: {lastRoute.confirmationMessage}</p>
          <p>Command: {lastRoute.command}</p>
          <p>Targets: {lastRoute.targetSessions.join(', ')}</p>
        </div>
      )}

      {/* Manual routing option */}
      <button onClick={() => manuallyRouteCommand('run tests', 'backend')}>
        Manually Route to Backend
      </button>
    </div>
  );
}
```

## Session Context Awareness

### How It Works

1. When a voice command is received, the hook checks for routing prefixes
2. If a routing prefix is found (switch, tell, broadcast, etc.), it routes accordingly
3. If no prefix is found:
   - If currently in a session, the command goes to that session
   - If not in a session, the command is broadcast to all

### Session Memory

- Last used session is remembered in sessionCacheRef
- Can be retrieved with getLastSession()
- Multiple sessions are tracked with timestamps
- Most recently used session is prioritized on return

### Session Switching

1. User says "switch to auth"
2. Hook parses this as a switch command
3. setActiveSession('auth') is called
4. onSessionSwitched callback is triggered
5. Socket.io emits 'session:switch' event to backend

## Socket Events

### Client → Server

- `voice:routing` - Emits routing info with command details
- `session:switch` - Indicates active session change
- `session:pause` - Pauses a session
- `session:resume` - Resumes a paused session

### Server → Client

- `session:switched` - Confirms session switch
- `session:paused` - Confirms session pause
- `session:resumed` - Confirms session resume

## Error Handling

The hooks include built-in error handling:

```typescript
try {
  await sessionRouter.routeToSession(command, sessionId, socket);
} catch (error) {
  console.error('Failed to route command:', error);
}
```

## Best Practices

1. **Always provide available sessions**: Call `updateAvailableSessions()` when sessions change
2. **Set active session on focus**: Call `setActiveSession()` when user focuses on a session
3. **Remember sessions**: Call `rememberSession()` when a session is used
4. **Handle disconnections**: Check socket connection before routing
5. **Validate commands**: Ensure parsed commands match expected formats

## Testing

### Manual Testing Steps

1. Start JARVIS with multiple sessions
2. Say "switch to planning" - should activate planning session
3. Say "tell auth to check credentials" - should route to auth session
4. Say "broadcast: run all tests" - should send to all sessions
5. Say "pause backend" - should pause backend session
6. Say "resume backend" - should resume backend session
7. Say "run tests" while in a session - should route to active session

### Expected Behaviors

- Commands are routed to correct sessions
- Session switching is smooth and responsive
- Broadcast commands reach all sessions
- Last session is remembered across commands
- Context awareness prevents incorrect routing

## Performance Considerations

- Command parsing is synchronous and fast (~1ms)
- Session cache is maintained in memory with timestamps
- Socket.io events are non-blocking
- Route history is limited to prevent memory growth

## Future Enhancements

- Voice confirmation before executing routes
- Session priorities for routing
- Command history and replay
- Session-specific voice commands
- Analytics and logging
- Multi-language support
- Custom routing rules
