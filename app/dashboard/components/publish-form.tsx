'use client';

import { useState } from 'react';

interface PublishFormProps {
  apiBase: string;
  token: string;
}

export default function PublishForm({ apiBase, token }: PublishFormProps) {
  const [topic, setTopic] = useState('');
  const [payload, setPayload] = useState('{"message": "hello"}');
  const [status, setStatus] = useState<{ ok: boolean; msg: string } | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setStatus(null);

    try {
      const parsedPayload = JSON.parse(payload) as unknown;
      const res = await fetch(`${apiBase}/api/publish`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ topic, payload: parsedPayload }),
      });

      const data = await res.json() as { messageId?: string; error?: string };
      if (res.ok) {
        setStatus({ ok: true, msg: `Published: ${data.messageId}` });
      } else {
        setStatus({ ok: false, msg: data.error ?? 'Unknown error' });
      }
    } catch (err) {
      const error = err as Error;
      setStatus({ ok: false, msg: error.message });
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="block text-sm text-slate-400 mb-1">Topic</label>
        <input
          type="text"
          value={topic}
          onChange={e => setTopic(e.target.value)}
          placeholder="sensor/temperature"
          className="w-full bg-slate-800 border border-slate-600 rounded px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-sky-500"
          required
        />
      </div>
      <div>
        <label className="block text-sm text-slate-400 mb-1">Payload (JSON)</label>
        <textarea
          value={payload}
          onChange={e => setPayload(e.target.value)}
          rows={4}
          className="w-full bg-slate-800 border border-slate-600 rounded px-3 py-2 text-sm font-mono text-slate-200 focus:outline-none focus:border-sky-500"
          required
        />
      </div>
      {status && (
        <div className={`text-sm p-2 rounded ${status.ok ? 'bg-emerald-900/30 text-emerald-400' : 'bg-red-900/30 text-red-400'}`}>
          {status.msg}
        </div>
      )}
      <button
        type="submit"
        disabled={loading}
        className="bg-sky-600 hover:bg-sky-500 disabled:opacity-50 text-white px-4 py-2 rounded text-sm transition-colors"
      >
        {loading ? 'Publishing...' : 'Publish'}
      </button>
    </form>
  );
}
