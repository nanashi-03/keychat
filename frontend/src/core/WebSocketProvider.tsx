import React, { useEffect, useRef } from 'react';
import { useAuth } from './useAuth';
import { WebSocketContext } from './useWebSocket';
import type { WebSocketMessage } from './useWebSocket';

export const WebSocketProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, token } = useAuth();
  const socketRef = useRef<WebSocket | null>(null);

  // Update the ref set type to use our defined message structure
  const listenersRef = useRef<Set<(data: WebSocketMessage) => void>>(new Set());

  useEffect(() => {
    if (!token || !user) {
      if (socketRef.current) socketRef.current.close();
      return;
    }

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws?username=${encodeURIComponent(user.username)}`;

    const ws = new WebSocket(wsUrl);
    socketRef.current = ws;

    ws.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data) as WebSocketMessage;
        listenersRef.current.forEach((cb) => cb(payload));
      } catch (err) {
        console.error('WebSocket payload parsing error:', err);
      }
    };

    return () => {
      ws.close();
    };
  }, [token, user]);

  const subscribe = (callback: (data: WebSocketMessage) => void) => {
    listenersRef.current.add(callback);
    return () => {
      listenersRef.current.delete(callback);
    };
  };

  return (
    <WebSocketContext.Provider value={{ subscribe }}>
      {children}
    </WebSocketContext.Provider>
  );
};
