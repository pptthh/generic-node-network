import { getNodeContext, isContextReady } from '../../../lib/api/handlers.js';

export const dynamic = 'force-dynamic';

export default async function MessagesPage() {
  if (!isContextReady()) {
    return <div className="text-slate-400 text-center py-10">Loading...</div>;
  }

  const { schema } = getNodeContext();
  const { messages, total } = await schema.getMessages({ limit: 50, order: 'desc' });

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-slate-100">Message History</h1>
        <p className="text-slate-400 text-sm mt-1">{total} total messages</p>
      </div>

      <div className="space-y-2">
        {(messages as Record<string, unknown>[]).map((msg, i) => (
          <div key={i} className="bg-slate-800 border border-slate-700 rounded-lg p-3">
            <div className="flex items-center justify-between mb-1">
              <span className={`text-xs px-1.5 py-0.5 rounded font-mono ${
                (msg as { type: string }).type === 'publish' ? 'bg-sky-900/50 text-sky-400' :
                (msg as { type: string }).type === 'query' ? 'bg-yellow-900/50 text-yellow-400' :
                'bg-emerald-900/50 text-emerald-400'
              }`}>
                {(msg as { type: string }).type}
              </span>
              <span className="text-xs text-slate-500">
                {(msg as { topic: string }).topic}
              </span>
              <span className="text-xs text-slate-500">
                {new Date((msg as { timestamp: number }).timestamp).toLocaleString()}
              </span>
            </div>
            <pre className="text-xs font-mono text-slate-300 overflow-x-auto">
              {JSON.stringify((msg as { payload: unknown }).payload, null, 2)}
            </pre>
          </div>
        ))}
        {messages.length === 0 && (
          <p className="text-slate-500 text-center py-10">No messages yet. Publish something!</p>
        )}
      </div>
    </div>
  );
}
