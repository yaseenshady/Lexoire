# Multi-Session Components - Visual Reference & API

## SessionCard Component

### Visual States

```
Active Session (Glowing):
┌─────────────────────────────────┐
│  ⚡ Active Session              │ ● (glowing indicator)
│  Session is executing cmd       │
│  ⚡ active                       │
│  5 commands | Jan 25, 2025      │
└─────────────────────────────────┘

Thinking Session (Purple):
┌─────────────────────────────────┐
│  🤔 Thinking                    │ ●
│  Processing previous command    │
│  🤔 thinking                    │
│  3 commands | Jan 24, 2025      │
└─────────────────────────────────┘

Idle Session (Gray):
┌─────────────────────────────────┐
│  ⏸️ Idle                         │
│  Waiting for input              │
│  1 command | Jan 20, 2025       │
└─────────────────────────────────┘

Paused Session (Orange):
┌─────────────────────────────────┐
│  ⏸️ Paused                       │ ●
│  Execution paused by user       │
│  ⏸️ paused                       │
│  2 commands | Jan 22, 2025      │
└─────────────────────────────────┘
```

### Props
```typescript
interface SessionCardProps {
  session: Session                          // Session data
  isActive: boolean                         // Highlight if active
  onClick: (sessionId: string) => void      // Selection handler
  onClose?: (sessionId: string) => void     // Optional close handler
  compact?: boolean                         // Compact view mode
}
```

### Usage
```jsx
<SessionCard
  session={mySession}
  isActive={activeSessionId === mySession.id}
  onClick={(id) => setActiveSessionId(id)}
  onClose={(id) => removeSession(id)}
  compact={false}
/>
```

---

## SessionTabs Component

### Visual Layout

```
┌─────────────────────────────┐
│ Sessions                  3 │
├─────────────────────────────┤
│                             │
│  ↑ (scroll up button)       │
│                             │
│  ┌───────────────────────┐  │
│  │ ⚡ Active Session   │  │ <- active = highlighted
│  │ Processing cmd      │  │    with cyan glow
│  │ 5 commands          │  │
│  └───────────────────────┘  │
│                             │
│  ┌───────────────────────┐  │
│  │ 🤔 Thinking         │  │
│  │ Analyzing response  │  │
│  │ 3 commands          │  │
│  └───────────────────────┘  │
│                             │
│  ↓ (scroll down button)     │
│                             │
│  ┌─── · · · ────────────┐   │
│  │ + New Session        │   │ <- dashed button
│  └─── · · · ────────────┘   │
│                             │
└─────────────────────────────┘
```

### Props
```typescript
interface SessionTabsProps {
  sessions: Session[]                       // All sessions
  activeSessionId: string                   // Currently active
  onSessionSelect: (id: string) => void     // Selection handler
  onSessionClose?: (id: string) => void     // Optional close
  onNewSession?: () => void                 // Optional new session
  compact?: boolean                         // Compact mode
}
```

### Features
- Scrollable with automatic up/down buttons
- Session counter badge
- Smooth animations
- Responsive to screen size
- Auto-hide scroll buttons when not needed

---

## SessionMaster Component

### Visual Layout

```
Non-Compact Mode:
┌────────────────────────────────────────────────────────────┐
│  🎛️ Orchestrator                    ● Ready  1/3  ⚙️       │
│  Current Project                                            │
├────────────────────────────────────────────────────────────┤
│ ● Active sessions: 1  │ ● Backend connected │ ● Ready... │
└────────────────────────────────────────────────────────────┘

Compact Mode:
┌──────────────────────────────────┐
│ 🎛️ Orchestrator ● Ready 1/3 ⚙️   │
└──────────────────────────────────┘

Executing State:
┌────────────────────────────────────────────────────────────┐
│  🎛️ (spinning) Orchestrator   ● Processing  1/3  ⚙️       │
│  Current Project                                            │
└────────────────────────────────────────────────────────────┘
```

### Status Color Mapping
- Connected + Idle → Cyan border, active status
- Connected + Executing → Purple border, processing status
- Disconnected → Orange border, offline status

### Props
```typescript
interface SessionMasterProps {
  activeSessionName: string           // Name of active session
  isConnected: boolean                // Backend connection status
  isExecuting: boolean                // Currently executing
  totalSessions: number               // Total session count
  activeSessions: number              // Active session count
  onSettings?: () => void             // Settings callback
  onStatusClick?: () => void          // Status click callback
  voiceOrbElement?: ReactNode         // Optional voice orb
  compactMode?: boolean               // Compact layout
}
```

### Usage
```jsx
<SessionMaster
  activeSessionName="Project Setup"
  isConnected={true}
  isExecuting={false}
  totalSessions={3}
  activeSessions={1}
  onSettings={handleSettings}
  onStatusClick={handleStatusClick}
  voiceOrbElement={<VoiceOrb {...props} />}
  compactMode={false}
/>
```

---

## MultiSessionDashboard Component

### Full Layout Structure

```
Full Desktop View:
┌───────────────────────────────────────────────────────────────┐
│              SessionMaster (Top Bar)                           │
├──────────────┬────────────────────────────────────────────────┤
│              │                                                │
│ SessionTabs  │          Main Content Area                     │
│ (Sessions    │      (ConversationPanel +                      │
│  List)       │       TerminalOutput)                          │
│  300px       │                                                │
│              │                                                │
│              │                                                │
│              │                                                │
└──────────────┴────────────────────────────────────────────────┘

Mobile View (Stacked):
┌─────────────────────────┐
│   SessionMaster         │
├─────────────────────────┤
│   SessionTabs           │
│  (Compact Mode)         │
├─────────────────────────┤
│                         │
│   Main Content Area     │
│  (Takes full width)     │
│                         │
└─────────────────────────┘
```

### Props
```typescript
interface MultiSessionDashboardProps {
  sessions: Session[]
  activeSessionId: string
  onSessionSelect: (id: string) => void
  onSessionClose?: (id: string) => void
  onNewSession?: () => void
  onSettings?: () => void
  onStatusClick?: () => void
  isConnected: boolean
  isExecuting: boolean
  children?: ReactNode                    // Main content
  voiceOrbElement?: ReactNode
  compactMode?: boolean
  showMaster?: boolean                    // Toggle master bar
  showTabs?: boolean                      // Toggle session tabs
}
```

### Usage
```jsx
<MultiSessionDashboard
  sessions={sessions}
  activeSessionId={activeSessionId}
  onSessionSelect={setActiveSessionId}
  onNewSession={createNewSession}
  isConnected={isConnected}
  isExecuting={isExecuting}
  voiceOrbElement={<VoiceOrb {...props} />}
>
  {/* Your content here */}
  <div className="flex-1 grid grid-rows-2 gap-4">
    <ConversationPanel {...props} />
    <TerminalOutput {...props} />
  </div>
</MultiSessionDashboard>
```

---

## Color Scheme Reference

### Session Status Colors
| Status | Icon | Color | Hex Code | Usage |
|--------|------|-------|----------|-------|
| Active | ⚡ | Neon Cyan | #00FFFF | Session running |
| Thinking | 🤔 | Neon Purple | #BF00FF | Processing response |
| Paused | ⏸️ | Orange | #FF9500 | Execution paused |
| Idle | ⏸️ | Gray | #808080 | Waiting for input |
| Completed | ✅ | Green | #00FF00 | Task finished |

### UI Element Colors
- **Primary Accent**: Neon Cyan
- **Secondary Accent**: Neon Purple
- **Warning**: Orange
- **Success**: Green
- **Text**: White with varying opacity
- **Background**: Dark with glassmorphic effect

---

## Animation Reference

### Transitions
- **Smooth slide in**: 0.3s cubic-bezier
- **Scale on hover**: 1.02x (slightly larger)
- **Tap feedback**: 0.98x (slightly smaller)
- **Status indicator glow**: 1.5s infinite pulse

### Key Animations
1. Session card selection → Slide in with scale
2. Session switching → Cross-fade with slide
3. Status indicator → Continuous glow pulse
4. Orchestrator icon (executing) → Rotating animation
5. New session button → Dashed border pulsing

---

## Responsive Breakpoints

| Screen Size | Layout | SessionTabs | SessionCard |
|-------------|--------|-------------|-------------|
| < 768px | Stacked vertical | Compact, full width | Compact display |
| 768-1023px | 30/70 split | Condensed, 30% | Standard |
| 1024px+ | 25/75 split | Full, 25% | Full with details |

---

## Integration Checklist

- [ ] Import components in App.tsx
- [ ] Create session state management
- [ ] Replace existing layout with MultiSessionDashboard
- [ ] Wire socket event listeners
- [ ] Connect existing components (ConversationPanel, TerminalOutput)
- [ ] Pass VoiceOrb via props
- [ ] Test responsive behavior
- [ ] Verify animations smooth
- [ ] Test session switching
- [ ] Verify accessibility (keyboard nav, contrast)

---

## Performance Tips

1. **Memoize session cards** for lists > 20 items
2. **Use virtual scrolling** for lists > 100 items
3. **Throttle scroll events** in SessionTabs
4. **Lazy load session content** when switching
5. **Debounce resize handlers** for responsive changes

