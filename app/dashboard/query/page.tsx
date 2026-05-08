'use client';

import { useState } from 'react';

export default function QueryPage() {
  const [target, setTarget] = useState('');
  const [action, setAction] = useState('get_state');
  const [timeout, setTimeout_] = useState(100);
  const [result, setResult] = useState<unknown>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleQuery(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const res = await fetch('/api/query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ target, request: { action }, timeout }),
      });
      const data = await res.json() as unknown;
      if (res.ok) setResult(data);
      else setError(JSON.stringify(data));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-4 max-w-xl">
      <div>
        <h1 className="text-2xl font-bold text-slate-100">Query Peer</h1>
        <p className="text-slate-400 text-sm mt-1">Send a request to a specific peer</p>
      </div>
      <div className="bg-slate-800 border border-slate-700 rounded-lg p-6 space-y-4">
        <form onSubmit={handleQuery} className="space-y-4">
          <div>
            <label className="block text-sm text-slate-400 mb-1">Target Peer ID</label>
            <input
              type="text"
              value={target}
              onChange={e => setTarget(e.target.value)}
              placeholder="node-b or Qm..."
              className="w-full bg-slate-900 border border-slate-600 rounded px-3 py-2 text-sm text-slate-200"
              required
            />
          </div>
          <div>
            <label className="block text-sm text-slate-400 mb-1">Action</label>
            <select
              value={action}
              onChange={e => setAction(e.target.value)}
              className="w-full bg-slate-900 border border-slate-600 rounded px-3 py-2 text-sm text-slate-200"
            >
              <option value="get_state">get_state</option>
              <option value="count_messages">count_messages</option>
              <option value="ping">ping</option>
            </select>
          </div>
          <div>
            <label className="block text-sm text-slate-400 mb-1">Timeout (ms)</label>
            <input
              type="number"
              value={timeout}
              onChange={e => setTimeout_(parseInt(e.target.value, 10))}
              min={50}
              max={5000}
              className="w-full bg-slate-900 border border-slate-600 rounded px-3 py-2 text-sm text-slate-200"
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="bg-sky-600 hover:bg-sky-500 disabled:opacity-50 text-white px-4 py-2 rounded text-sm"
          >
            {loading ? 'Querying...' : 'Send Query'}
          </button>
        </form>

        {error && <div className="text-red-400 text-sm bg-red-900/20 rounded p-2">{error}</div>}
        {result && (
          <div>
            <p className="text-xs text-slate-400 mb-1">Response:</p>
            <pre className="text-xs font-mono text-emerald-400 bg-slate-900 rounded p-2 overflow-x-auto">
              {JSON.stringify(result, null, 2)}
            </pre>
          </div>
        )}
      </div>
    </div>
  );
}
