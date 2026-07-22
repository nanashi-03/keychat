import { createContext, useContext } from 'react';

// Define a structured layout for your WebSocket messages instead of 'any'
export interface WebSocketMessage {
  type: string;
  payload: unknown;
}

export interface WebSocketContextType {
  // Subscribers will now receive safely typed data
  subscribe: (callback: (data: WebSocketMessage) => void) => () => void;
}

export const WebSocketContext = createContext<WebSocketContextType | null>(null);

export const useWebSocket = () => {
  const context = useContext(WebSocketContext);
  if (!context) throw new Error('useWebSocket must be used within a WebSocketProvider');
  return context;
};
