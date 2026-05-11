import PeerList from '../components/peer-list';
import { getNodeContext, isContextReady } from '../../../lib/api/handlers';

export const dynamic = 'force-dynamic';

export default function PeersPage() {
  if (!isContextReady()) {
    return <div className="text-slate-400 text-center py-10">Loading...</div>;
  }

  const { node } = getNodeContext();
  const peers = node.getPeers();
  const online = peers.filter(p => p.status === 'online').length;
  const offline = peers.filter(p => p.status === 'offline').length;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-slate-100">Peers</h1>
        <p className="text-slate-400 text-sm mt-1">
          <span className="text-emerald-400">{online} online</span>
          {offline > 0 && <span className="text-slate-500 ml-2">{offline} offline</span>}
        </p>
      </div>
      <PeerList peers={peers} />
    </div>
  );
}
