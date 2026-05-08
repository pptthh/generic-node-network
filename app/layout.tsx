import type { Metadata } from 'next';
import '../styles/globals.css';

export const metadata: Metadata = {
  title: 'GNN - GenericNodeNet',
  description: 'Distributed P2P Node Network Framework',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body className="bg-slate-900 text-slate-200 min-h-screen">
        {children}
      </body>
    </html>
  );
}
