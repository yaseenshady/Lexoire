import { useEffect, useMemo, useRef, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import { SocketEvents } from '../types';
import { normalizeEndpoint } from '../services/api';

export type ConnectionState = 'connecting' | 'connected' | 'reconnecting' | 'disconnected' | 'error';

export const useSocket = (endpoint?: string) => {
  const [isConnected, setIsConnected] = useState(false);
  const [connectionState, setConnectionState] = useState<ConnectionState>('connecting');
  const [lastError, setLastError] = useState<string | null>(null);
  const socketRef = useRef<Socket<SocketEvents> | null>(null);
  const resolvedEndpoint = useMemo(() => normalizeEndpoint(endpoint), [endpoint]);

  useEffect(() => {
    const socket = io(resolvedEndpoint, {
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      timeout: 5000
    });

    const manager = socket.io;

    setConnectionState('connecting');
    setLastError(null);

    socket.on('connect', () => {
      setIsConnected(true);
      setConnectionState('connected');
      setLastError(null);
    });

    socket.on('disconnect', () => {
      setIsConnected(false);
      setConnectionState('disconnected');
    });

    socket.on('connect_error', (error) => {
      setIsConnected(false);
      setConnectionState('error');
      setLastError(error.message || 'Unable to connect to backend');
    });

    socket.on('connection:status', (status) => {
      const connected = status === 'connected';
      setIsConnected(connected);
      setConnectionState(connected ? 'connected' : 'disconnected');
    });

    manager.on('reconnect_attempt', () => {
      setConnectionState('reconnecting');
    });

    manager.on('reconnect', () => {
      setIsConnected(true);
      setConnectionState('connected');
      setLastError(null);
    });

    manager.on('reconnect_error', (error) => {
      setConnectionState('error');
      setLastError(error.message || 'Reconnect failed');
    });

    socketRef.current = socket;

    return () => {
      manager.off('reconnect_attempt');
      manager.off('reconnect');
      manager.off('reconnect_error');
      socket.disconnect();
      socketRef.current = null;
    };
  }, [resolvedEndpoint]);

  return {
    socket: socketRef.current,
    isConnected,
    connectionState,
    lastError,
    endpoint: resolvedEndpoint
  };
};
