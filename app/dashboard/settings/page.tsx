import { getNodeContext, isContextReady } from '../../../lib/api/handlers';

export const dynamic = 'force-dynamic';

export default function SettingsPage() {
  if (!isContextReady()) {
    return <div className="text-slate-400 text-center py-10">Loading...</div>;
  }

  const { config } = getNodeContext();

  return (
    <div className="space-y-4 max-w-xl">
      <div>
        <h1 className="text-2xl font-bold text-slate-100">Settings</h1>
        <p className="text-slate-400 text-sm mt-1">Current node configuration</p>
      </div>

      <div className="bg-slate-800 border border-slate-700 rounded-lg divide-y divide-slate-700">
        {[
          { label: 'Node ID', value: config.nodeId },
          { label: 'API Port', value: config.apiPort.toString() },
          { label: 'P2P Port', value: config.p2pPort.toString() },
          { label: 'DB Path', value: config.dbPath },
          { label: 'Config File', value: config.configFile },
          { label: 'Log Level', value: config.logging.level },
          { label: 'Message Retention', value: `${config.message.retentionDays} days` },
          { label: 'Peer TTL', value: `${config.peer.ttlDays} days` },
          { label: 'Query Timeout', value: `${config.timeouts.queryMs}ms` },
          { label: 'Broadcast Timeout', value: `${config.timeouts.broadcastMs}ms` },
          { label: 'mDNS Discovery', value: config.discovery.mdnsEnabled ? 'Enabled' : 'Disabled' },
          { label: 'DHT Discovery', value: config.discovery.dhtEnabled ? 'Enabled' : 'Disabled' },
        ].map(({ label, value }) => (
          <div key={label} className="flex items-center justify-between px-4 py-3">
            <span className="text-sm text-slate-400">{label}</span>
            <span className="text-sm font-mono text-slate-200">{value}</span>
          </div>
        ))}
      </div>

      <div className="bg-slate-800 border border-slate-700 rounded-lg p-4">
        <h2 className="text-sm font-medium text-slate-300 mb-2">API Token</h2>
        <p className="text-xs font-mono text-yellow-400 break-all">{config.apiToken}</p>
        <p className="text-xs text-slate-500 mt-1">Use this token in Authorization: Bearer &lt;token&gt; header</p>
      </div>

      {config.bootstrapPeers.length > 0 && (
        <div className="bg-slate-800 border border-slate-700 rounded-lg p-4">
          <h2 className="text-sm font-medium text-slate-300 mb-2">Bootstrap Peers</h2>
          {config.bootstrapPeers.map(peer => (
            <p key={peer} className="text-xs font-mono text-slate-400">{peer}</p>
          ))}
        </div>
      )}
    </div>
  );
}
