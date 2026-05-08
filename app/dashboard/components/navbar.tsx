'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const navItems = [
  { href: '/dashboard', label: 'Overview' },
  { href: '/dashboard/peers', label: 'Peers' },
  { href: '/dashboard/messages', label: 'Messages' },
  { href: '/dashboard/publish', label: 'Publish' },
  { href: '/dashboard/query', label: 'Query' },
  { href: '/dashboard/settings', label: 'Settings' },
];

export default function Navbar() {
  const pathname = usePathname();

  return (
    <nav className="bg-slate-800 border-b border-slate-700 px-6 py-3">
      <div className="flex items-center justify-between max-w-7xl mx-auto">
        <div className="flex items-center gap-2">
          <span className="text-sky-400 font-bold text-xl">GNN</span>
          <span className="text-slate-400 text-sm">GenericNodeNet</span>
        </div>
        <div className="flex items-center gap-1">
          {navItems.map(item => (
            <Link
              key={item.href}
              href={item.href}
              className={`px-3 py-1.5 rounded text-sm transition-colors ${
                pathname === item.href
                  ? 'bg-sky-500 text-white'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-700'
              }`}
            >
              {item.label}
            </Link>
          ))}
        </div>
      </div>
    </nav>
  );
}
