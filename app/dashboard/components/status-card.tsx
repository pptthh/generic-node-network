interface StatusCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  accent?: 'green' | 'red' | 'yellow' | 'blue';
}

export default function StatusCard({ title, value, subtitle, accent = 'blue' }: StatusCardProps) {
  const accentClasses = {
    green: 'text-emerald-400',
    red: 'text-red-400',
    yellow: 'text-yellow-400',
    blue: 'text-sky-400',
  };

  return (
    <div className="bg-slate-800 border border-slate-700 rounded-lg p-4">
      <p className="text-slate-400 text-sm mb-1">{title}</p>
      <p className={`text-2xl font-bold ${accentClasses[accent]}`} data-testid={`stat-${title.toLowerCase().replace(/\s+/g, '-')}`}>
        {value}
      </p>
      {subtitle && <p className="text-slate-500 text-xs mt-1">{subtitle}</p>}
    </div>
  );
}
