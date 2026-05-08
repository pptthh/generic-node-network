import { headers } from 'next/headers';
import PublishForm from '../components/publish-form.js';
import { getNodeContext, isContextReady } from '../../../lib/api/handlers.js';

export const dynamic = 'force-dynamic';

export default async function PublishPage() {
  const headersList = await headers();
  const host = headersList.get('host') ?? 'localhost:25111';
  const apiBase = `http://${host}`;

  if (!isContextReady()) {
    return <div className="text-slate-400 text-center py-10">Loading...</div>;
  }

  const { config } = getNodeContext();

  return (
    <div className="space-y-4 max-w-xl">
      <div>
        <h1 className="text-2xl font-bold text-slate-100">Publish Message</h1>
        <p className="text-slate-400 text-sm mt-1">Broadcast a message to all subscribed peers</p>
      </div>
      <div className="bg-slate-800 border border-slate-700 rounded-lg p-6">
        <PublishForm apiBase={apiBase} token={config.apiToken} />
      </div>
    </div>
  );
}
