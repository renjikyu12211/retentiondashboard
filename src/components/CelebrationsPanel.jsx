import { useState } from 'react';
import { Cake, Star, Users, CheckCircle } from 'lucide-react';

function DaysChip({ days }) {
  if (days === 0) return <span className="rounded-full bg-emerald-500/20 border border-emerald-500/30 px-2 py-0.5 text-xs font-medium text-emerald-600">Today!</span>;
  if (days === 1) return <span className="rounded-full bg-yellow-500/10 border border-yellow-500/20 px-2 py-0.5 text-xs font-medium text-yellow-600">Tomorrow</span>;
  return <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600">{days}d</span>;
}

function ClientRow({ c, sub }) {
  return (
    <div className="flex items-center justify-between px-5 py-2.5 border-b border-gray-200/80 last:border-0 hover:bg-gray-50 transition-colors">
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-gray-900 truncate">{c.name}</p>
        <p className="text-xs text-gray-600">{c.date} · {sub}</p>
      </div>
      <DaysChip days={c.daysUntil} />
    </div>
  );
}

function EmptyState({ message }) {
  return (
    <div className="py-8 text-center">
      <CheckCircle className="h-6 w-6 text-gray-400 mx-auto mb-2" />
      <p className="text-sm text-gray-600">{message}</p>
    </div>
  );
}

export default function CelebrationsPanel({ data, loading, error }) {
  const [tab, setTab] = useState('active');

  const birthdaysActive   = data?.birthdaysActive   || [];
  const birthdaysInactive = data?.birthdaysInactive || [];
  const anniversaries     = data?.anniversaries     || [];

  const tabs = [
    { key: 'active',       label: 'Birthdays',         icon: Cake,  count: birthdaysActive.length   },
    { key: 'inactive',     label: 'Lapsed Birthdays',  icon: Users, count: birthdaysInactive.length },
    { key: 'anniversaries',label: 'Anniversaries',     icon: Star,  count: anniversaries.length     },
  ];

  return (
    <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
      {/* Header */}
      <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-gray-200">
        <div className="flex items-center gap-2">
          <Cake className="h-4 w-4 text-pink-500" />
          <h2 className="font-semibold text-gray-900">Upcoming Celebrations</h2>
        </div>
        <p className="text-xs text-gray-600">Next 30 days</p>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-gray-200">
        {tabs.map(({ key, label, icon: Icon, count }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`flex items-center gap-2 px-5 py-3 text-sm border-b-2 transition-colors ${
              tab === key
                ? 'border-[#475AFF] text-[#475AFF] bg-gray-50'
                : 'border-transparent text-gray-600 hover:text-gray-900 hover:bg-gray-50'
            }`}
          >
            <Icon className="h-3.5 w-3.5" />
            {label}
            {!loading && count > 0 && (
              <span className={`rounded-full px-1.5 py-0.5 text-xs ${
                key === 'inactive'
                  ? 'bg-orange-500/10 text-orange-600'
                  : 'bg-gray-100 text-gray-600'
              }`}>
                {count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Body */}
      <div className="overflow-y-auto max-h-72 scrollbar-thin">
        {loading && (
          <div className="space-y-2 p-5">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-10 animate-pulse rounded-lg bg-gray-200" />
            ))}
          </div>
        )}

        {error && !loading && (
          <p className="p-5 text-sm text-red-400">Could not load: {error}</p>
        )}

        {!loading && !error && tab === 'active' && (
          birthdaysActive.length === 0
            ? <EmptyState message="No active member birthdays in the next 30 days" />
            : birthdaysActive.map(c => <ClientRow key={c.id} c={c} sub={`turning ${c.age}`} />)
        )}

        {!loading && !error && tab === 'inactive' && (
          birthdaysInactive.length === 0
            ? <EmptyState message="No lapsed member birthdays in the next 30 days" />
            : <>
                <p className="px-5 py-2.5 text-xs text-orange-700 bg-orange-50 border-b border-gray-200">
                  Reach out — a birthday is a great reason to reconnect
                </p>
                {birthdaysInactive.map(c => <ClientRow key={c.id} c={c} sub={`turning ${c.age}`} />)}
              </>
        )}

        {!loading && !error && tab === 'anniversaries' && (
          anniversaries.length === 0
            ? <EmptyState message="No anniversaries in the next 30 days" />
            : anniversaries.map(c => (
                <ClientRow key={c.id} c={c} sub={`${c.years} ${c.years === 1 ? 'year' : 'years'}`} />
              ))
        )}
      </div>
    </div>
  );
}
