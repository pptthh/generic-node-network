import { headers } from 'next/headers';
import StatusCard from './components/status-card';
import MessageStream from './components/message-stream';
import { getNodeContext, isContextReady } from '../../lib/api/handlers';
import { uptimeSeconds, nowIso } from '../../lib/utils/time';

export const dynamic = 'force-dynamic';

function formatUptime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

export default async function DashboardPage() {
  const headersList = await headers();
  const host = headersList.get('host') ?? 'localhost:25111';
  const protocol = process.env.NODE_ENV === 'production' ? 'https' : 'http';
  const wsProtocol = process.env.NODE_ENV === 'production' ? 'wss' : 'ws';
  const apiBase = `${protocol}://${host}`;
  const wsUrl = `${wsProtocol}://${host}/ws`;

  if (!isContextReady()) {
    return (
      <div className="text-center py-20 text-slate-400">
        <p className="text-2xl mb-2">Starting up...</p>
        <p className="text-sm">Node is initializing</p>
      </div>
    );
  }

  const { node, schema, config } = getNodeContext();
  const messageCount = await schema.countMessages();
  const subscriptionCount = await schema.countSubscriptions(config.nodeId);
  const onlinePeers = node.getPeers().filter(p => p.status === 'online').length;
  const uptime = uptimeSeconds(node.startedAt);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-100">Node Overview</h1>
        <p className="text-slate-400 text-sm mt-1" data-testid="node-id">
          Node ID: <span className="font-mono text-sky-400">{node.getNodeId()}</span>
        </p>
        <p className="text-slate-500 text-xs mt-0.5">
          Peer ID: <span className="font-mono">{node.getPeerId()}</span>
        </p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatusCard title="Status" value="ONLINE" accent="green" />
        <StatusCard title="Connected Peers" value={onlinePeers} accent="blue" />
        <StatusCard title="Messages" value={messageCount} subtitle="total stored" />
        <StatusCard title="Subscriptions" value={subscriptionCount} />
        <StatusCard title="Uptime" value={formatUptime(uptime)} accent="green" />
        <StatusCard title="API Port" value={config.apiPort} />
        <StatusCard title="P2P Port" value={config.p2pPort} />
        <StatusCard title="Last Update" value={new Date().toLocaleTimeString()} />
      </div>

      <div>
        <h2 className="text-lg font-semibold text-slate-200 mb-3">Live Event Stream</h2>
        <MessageStream wsUrl={wsUrl} token={config.apiToken} />
      </div>

      <div className="bg-slate-800 border border-slate-700 rounded-lg p-4">
        <h2 className="text-sm font-medium text-slate-300 mb-2">P2P Addresses</h2>
        <div className="space-y-1">
          {node.getMultiaddrs().map(addr => (
            <p key={addr} className="text-xs font-mono text-slate-400">{addr}</p>
          ))}
          {node.getMultiaddrs().length === 0 && (
            <p className="text-xs text-slate-500">No addresses available</p>
          )}
        </div>
      </div>
    </div>
  );
}
