import type { Peer } from '../../../lib/types/peers';

interface PeerListProps {
  peers: Peer[];
}

export default function PeerList({ peers }: PeerListProps) {
  if (peers.length === 0) {
    return (
      <div className="text-slate-500 text-center py-8">
        No peers discovered yet. Waiting for mDNS discovery...
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {peers.map(peer => (
        <div
          key={peer.peerId}
          className="bg-slate-800 border border-slate-700 rounded-lg p-3 flex items-center justify-between"
          data-testid="peer-item"
        >
          <div>
            <p className="text-sm font-mono text-slate-300">
              {peer.metadata?.alias ?? peer.peerId.slice(0, 20) + '...'}
            </p>
            <p className="text-xs text-slate-500">{peer.multiaddr}</p>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs text-slate-400">{peer.discoveryMethod}</span>
            <span className={`flex items-center gap-1 text-xs px-2 py-0.5 rounded-full ${
              peer.status === 'online'
                ? 'bg-emerald-900/50 text-emerald-400'
                : 'bg-slate-700 text-slate-400'
            }`}>
              <span className={`w-1.5 h-1.5 rounded-full ${peer.status === 'online' ? 'bg-emerald-400' : 'bg-slate-400'}`} />
              {peer.status}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}
