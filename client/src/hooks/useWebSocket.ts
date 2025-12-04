import { useEffect, useCallback, useRef } from "react";

interface WebSocketMessage {
  type: string;
  data: any;
  timestamp: number;
}

type MessageHandler = (message: WebSocketMessage) => void;

// Check if running on Cloudflare Workers (no WebSocket support without Durable Objects)
const isCloudflareWorkers = (): boolean => {
  const host = window.location.host;
  return host.includes('.workers.dev') || host.includes('angocloud.ao');
};

export function useWebSocket(userId?: string, isAdmin?: boolean) {
  const wsRef = useRef<WebSocket | null>(null);
  const handlersRef = useRef<Map<string, Set<MessageHandler>>>(new Map());
  const reconnectAttemptsRef = useRef(0);
  const maxReconnectAttemptsRef = useRef(3);
  const isDisabledRef = useRef(isCloudflareWorkers()); // Disable on Cloudflare Workers

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;
    if (isDisabledRef.current) return;

    try {
      const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      const wsUrl = `${protocol}//${window.location.host}/ws`;
      const ws = new WebSocket(wsUrl);

      ws.onopen = () => {
        reconnectAttemptsRef.current = 0;
        
        if (userId) {
          ws.send(JSON.stringify({ type: "auth", userId, isAdmin }));
        }
      };

      ws.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data) as WebSocketMessage;
          const handlers = handlersRef.current.get(message.type);
          if (handlers) {
            handlers.forEach(handler => handler(message));
          }
        } catch (error) {
          console.error("WebSocket message parse error:", error);
        }
      };

      ws.onerror = () => {
        // Silently handle errors - WebSocket may be disabled in development
      };

      ws.onclose = () => {
        wsRef.current = null;

        if (reconnectAttemptsRef.current < maxReconnectAttemptsRef.current && !isDisabledRef.current) {
          reconnectAttemptsRef.current++;
          const delay = Math.min(1000 * Math.pow(2, reconnectAttemptsRef.current), 10000);
          setTimeout(connect, delay);
        } else if (reconnectAttemptsRef.current >= maxReconnectAttemptsRef.current) {
          // WebSocket likely disabled in development mode
          isDisabledRef.current = true;
        }
      };

      wsRef.current = ws;
    } catch (error) {
      // Silently handle connection errors
      isDisabledRef.current = true;
    }
  }, [userId, isAdmin]);

  useEffect(() => {
    if (userId) {
      connect();
      return () => {
        if (wsRef.current) {
          wsRef.current.close();
          wsRef.current = null;
        }
      };
    }
  }, [userId, connect]);

  const on = useCallback((type: string, handler: MessageHandler) => {
    if (!handlersRef.current.has(type)) {
      handlersRef.current.set(type, new Set());
    }
    handlersRef.current.get(type)?.add(handler);

    return () => {
      const handlers = handlersRef.current.get(type);
      if (handlers) {
        handlers.delete(handler);
      }
    };
  }, []);

  const off = useCallback((type: string, handler: MessageHandler) => {
    const handlers = handlersRef.current.get(type);
    if (handlers) {
      handlers.delete(handler);
    }
  }, []);

  const send = useCallback((type: string, data?: any) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type, data }));
    }
  }, []);

  return { on, off, send, isConnected: wsRef.current?.readyState === WebSocket.OPEN };
}
