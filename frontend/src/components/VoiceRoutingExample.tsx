import React, { useEffect, useState } from 'react';
import { useVoiceRouting } from '../hooks/useVoiceRouting';
import { useSocket } from '../hooks/useSocket';

/**
 * Example component demonstrating voice routing functionality
 * This shows how to use the useVoiceRouting hook in practice
 */
export const VoiceRoutingExample: React.FC = () => {
  const { socket } = useSocket();
  const [mockSessions, setMockSessions] = useState(['planning', 'auth', 'backend']);

  const {
    isListening,
    transcript,
    interimTranscript,
    confidence,
    startListening,
    stopListening,
    resetTranscript,
    currentSessionId,
    lastSessionId,
    availableSessions,
    lastRoute,
    isAwaitingConfirmation,
    setActiveSession,
    updateAvailableSessions,
    routeHistory
  } = useVoiceRouting({
    socket: socket || undefined,
    enableRouting: true,
    onRouteExecuted: (route) => {
      console.log('Route executed:', route);
    }
  });

  // Initialize available sessions on mount
  useEffect(() => {
    updateAvailableSessions(mockSessions);
  }, [updateAvailableSessions]);

  const handleStartListening = () => {
    resetTranscript();
    startListening();
  };

  const handleStopListening = () => {
    stopListening();
  };

  const handleAddSession = () => {
    const newSessionName = `session-${Date.now()}`;
    const updatedSessions = [...mockSessions, newSessionName];
    setMockSessions(updatedSessions);
    updateAvailableSessions(updatedSessions);
  };

  const handleRemoveSession = (sessionName: string) => {
    const updatedSessions = mockSessions.filter((s) => s !== sessionName);
    setMockSessions(updatedSessions);
    updateAvailableSessions(updatedSessions);
  };

  const handleSetActiveSession = (sessionName: string) => {
    setActiveSession(sessionName);
  };

  return (
    <div className="p-6 bg-gray-900 text-white rounded-lg max-w-2xl">
      <h2 className="text-2xl font-bold mb-4">Voice Routing System</h2>

      {/* Voice Control Section */}
      <div className="mb-6 p-4 bg-gray-800 rounded">
        <h3 className="text-lg font-semibold mb-3">Voice Control</h3>

        <div className="flex gap-2 mb-4">
          <button
            onClick={handleStartListening}
            disabled={isListening}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 rounded"
          >
            {isListening ? 'Listening...' : 'Start Listening'}
          </button>

          <button
            onClick={handleStopListening}
            disabled={!isListening}
            className="px-4 py-2 bg-red-600 hover:bg-red-700 disabled:bg-gray-600 rounded"
          >
            Stop Listening
          </button>

          <button
            onClick={resetTranscript}
            className="px-4 py-2 bg-gray-600 hover:bg-gray-700 rounded"
          >
            Reset
          </button>
        </div>

        <div className="space-y-2">
          {transcript && (
            <div>
              <p className="text-sm text-gray-400">Final Transcript:</p>
              <p className="text-lg text-green-400">{transcript}</p>
            </div>
          )}

          {interimTranscript && (
            <div>
              <p className="text-sm text-gray-400">Interim:</p>
              <p className="text-lg text-yellow-400">{interimTranscript}</p>
            </div>
          )}

          {confidence > 0 && (
            <p className="text-sm">Confidence: {(confidence * 100).toFixed(1)}%</p>
          )}
        </div>
      </div>

      {/* Session Management Section */}
      <div className="mb-6 p-4 bg-gray-800 rounded">
        <h3 className="text-lg font-semibold mb-3">Sessions</h3>

        <div className="mb-4">
          <p className="text-sm text-gray-400 mb-2">Active Session: <span className="text-blue-400">{currentSessionId || 'None'}</span></p>
          <p className="text-sm text-gray-400 mb-2">Last Session: <span className="text-blue-400">{lastSessionId || 'None'}</span></p>
        </div>

        <div className="mb-4">
          <p className="text-sm text-gray-400 mb-2">Available Sessions ({availableSessions.length}):</p>
          <div className="flex flex-wrap gap-2">
            {availableSessions.map((session) => (
              <div
                key={session}
                className={`px-3 py-1 rounded text-sm cursor-pointer transition ${
                  currentSessionId === session
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                }`}
                onClick={() => handleSetActiveSession(session)}
              >
                {session}
              </div>
            ))}
          </div>
        </div>

        <div className="flex gap-2">
          <button
            onClick={handleAddSession}
            className="px-3 py-1 text-sm bg-green-600 hover:bg-green-700 rounded"
          >
            Add Session
          </button>

          {currentSessionId && (
            <button
              onClick={() => handleRemoveSession(currentSessionId)}
              className="px-3 py-1 text-sm bg-red-600 hover:bg-red-700 rounded"
            >
              Remove {currentSessionId}
            </button>
          )}
        </div>
      </div>

      {/* Last Route Section */}
      {lastRoute && (
        <div className="mb-6 p-4 bg-gray-800 rounded border border-blue-600">
          <h3 className="text-lg font-semibold mb-3">Last Route</h3>

          <div className="space-y-2">
            <p className="text-sm">
              <span className="text-gray-400">Status:</span>{' '}
              <span className={isAwaitingConfirmation ? 'text-yellow-400' : 'text-green-400'}>
                {isAwaitingConfirmation ? 'Awaiting Confirmation' : 'Executed'}
              </span>
            </p>
            <p className="text-sm">
              <span className="text-gray-400">Message:</span> {lastRoute.confirmationMessage}
            </p>
            <p className="text-sm">
              <span className="text-gray-400">Command:</span> {lastRoute.command}
            </p>
            <p className="text-sm">
              <span className="text-gray-400">Targets:</span> {lastRoute.targetSessions.join(', ')}
            </p>
            <p className="text-sm">
              <span className="text-gray-400">Broadcast:</span>{' '}
              <span className={lastRoute.broadcast ? 'text-blue-400' : 'text-gray-400'}>
                {lastRoute.broadcast ? 'Yes' : 'No'}
              </span>
            </p>
          </div>
        </div>
      )}

      {/* Route History Section */}
      {routeHistory.length > 0 && (
        <div className="p-4 bg-gray-800 rounded">
          <h3 className="text-lg font-semibold mb-3">Route History ({routeHistory.length})</h3>

          <div className="space-y-2 max-h-48 overflow-y-auto">
            {routeHistory.slice().reverse().map((route, index) => (
              <div key={index} className="p-2 bg-gray-700 rounded text-sm">
                <p>
                  <span className="text-gray-400">#{routeHistory.length - index}:</span>{' '}
                  {route.command} → {route.targetSessions.join(', ')}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Commands Reference */}
      <div className="mt-6 p-4 bg-gray-800 rounded">
        <h3 className="text-lg font-semibold mb-3">Commands Reference</h3>

        <div className="space-y-1 text-sm text-gray-300">
          <p>• "switch to {'{session}'}": Switch to a session</p>
          <p>• "tell {'{session}'} to {'{command}'}": Route command to session</p>
          <p>• "broadcast: {'{command}'}": Send to all sessions</p>
          <p>• "pause {'{session}'}": Pause a session</p>
          <p>• "resume {'{session}'}": Resume a session</p>
          <p>• "{'{command}'}" (in session): Route to current session</p>
        </div>
      </div>
    </div>
  );
};

export default VoiceRoutingExample;
