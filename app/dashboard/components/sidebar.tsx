'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const navItems = [
  { href: '/dashboard', label: 'Overview', icon: '◉' },
  { href: '/dashboard/peers', label: 'Peers', icon: '◎' },
  { href: '/dashboard/messages', label: 'Messages', icon: '◈' },
  { href: '/dashboard/publish', label: 'Publish', icon: '◆' },
  { href: '/dashboard/query', label: 'Query', icon: '◇' },
  { href: '/dashboard/settings', label: 'Settings', icon: '◳' },
];

export default function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="w-48 bg-slate-800 border-r border-slate-700 min-h-screen p-3">
      <nav className="space-y-1">
        {navItems.map(item => (
          <Link
            key={item.href}
            href={item.href}
            className={`flex items-center gap-2 px-3 py-2 rounded text-sm transition-colors ${
              pathname === item.href
                ? 'bg-sky-900/50 text-sky-400 border border-sky-700'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-700'
            }`}
          >
            <span>{item.icon}</span>
            <span>{item.label}</span>
          </Link>
        ))}
      </nav>
    </aside>
  );
}
