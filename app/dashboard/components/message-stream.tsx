'use client';

import { useEffect, useRef, useState } from 'react';
import type { WebSocketEvent } from '../../../lib/types/index';

interface StreamMessage {
  id: string;
  time: string;
  event: WebSocketEvent;
}

interface MessageStreamProps {
  wsUrl: string;
  token: string;
}

export default function MessageStream({ wsUrl, token }: MessageStreamProps) {
  const [messages, setMessages] = useState<StreamMessage[]>([]);
  const [connected, setConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    const url = `${wsUrl}?token=${encodeURIComponent(token)}`;

    function connect() {
      const ws = new WebSocket(url);
      wsRef.current = ws;

      ws.onopen = () => setConnected(true);
      ws.onclose = () => {
        setConnected(false);
        setTimeout(connect, 3000);
      };
      ws.onerror = () => ws.close();

      ws.onmessage = (evt) => {
        try {
          const event = JSON.parse(evt.data as string) as WebSocketEvent;
          setMessages(prev => [{
            id: crypto.randomUUID(),
            time: new Date().toLocaleTimeString(),
            event,
          }, ...prev].slice(0, 50));
        } catch {
          // ignore malformed messages
        }
      };
    }

    connect();
    return () => wsRef.current?.close();
  }, [wsUrl, token]);

  return (
    <div className="bg-slate-800 border border-slate-700 rounded-lg overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2 border-b border-slate-700">
        <span className="text-sm font-medium text-slate-300">Live Events</span>
        <span className={`flex items-center gap-1 text-xs ${connected ? 'text-emerald-400' : 'text-red-400'}`}>
          <span className={`w-1.5 h-1.5 rounded-full ${connected ? 'bg-emerald-400 animate-pulse' : 'bg-red-400'}`} />
          {connected ? 'Connected' : 'Reconnecting...'}
        </span>
      </div>
      <div className="max-h-96 overflow-y-auto p-3 space-y-2">
        {messages.length === 0 ? (
          <p className="text-slate-500 text-sm text-center py-4">Waiting for events...</p>
        ) : (
          messages.map(item => (
            <div key={item.id} className="text-xs font-mono bg-slate-900 rounded p-2">
              <span className="text-slate-500">{item.time}</span>
              {' '}
              <span className="text-sky-400">{item.event.type}</span>
              {' '}
              <span className="text-slate-300">
                {JSON.stringify(item.event).slice(0, 120)}
              </span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
