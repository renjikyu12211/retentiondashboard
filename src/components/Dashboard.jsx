import { useState, useMemo } from 'react';
import { format, isToday } from 'date-fns';
import { RefreshCw, Activity, DollarSign } from 'lucide-react';
import StatsGrid          from './StatsGrid.jsx';
import AttendanceChart    from './AttendanceChart.jsx';
import SuspensionsList    from './SuspensionsList.jsx';
import RedsList           from './RedsList.jsx';
import FringeClientsTable from './FringeClientsTable.jsx';
import RevenueCards       from './RevenueCards.jsx';
import PaymentIssuesTable from './PaymentIssuesTable.jsx';
import DeclinedList       from './DeclinedList.jsx';
import CelebrationsPanel   from './CelebrationsPanel.jsx';

// Onboarding and Personal Training tabs are hidden but kept in the codebase for now.
const TABS = [
  { key: 'operations',        label: 'Operations',        Icon: Activity  },
  { key: 'finances',          label: 'Finances',          Icon: DollarSign },
];

const SHORT_PRODUCTS = new Set(['3-Session', '14-Day']);

export default function Dashboard({ data, loading, errors, lastRefresh, onRefresh, contactLog }) {
  const [tab, setTab] = useState('operations');
  const anyLoading    = Object.values(loading).some(Boolean);

  const decisions = {};
  const getDecision = () => null;
  const setDecision = async () => {};

  // All onboarding clients (from each week column)
  const allOnboardingClients = useMemo(() => [
    ...(data.onboarding?.week1 || []),
    ...(data.onboarding?.week2 || []),
    ...(data.onboarding?.week3 || []),
    ...(data.onboarding?.week4 || []),
  ], [data.onboarding]);

  // IDs of currently active onboarding clients — excludes any short-product
  // clients who have explicitly said no-rollover (they're done with onboarding)
  const onboardingIds = useMemo(() => new Set(
    allOnboardingClients
      .filter((c) => {
        if (!SHORT_PRODUCTS.has(c.shortProduct)) return true;
        return decisions[c.id]?.decision !== 'no-rollover';
      })
      .map((c) => c.id)
  ), [allOnboardingClients, decisions]);

  return (
    <div className="min-h-screen bg-[#F4F5F6] text-gray-900">
      {/* ── Header ── */}
      <header className="sticky top-0 z-30 border-b border-gray-200 bg-white/90 backdrop-blur px-6 py-4">
        <div className="mx-auto max-w-7xl flex items-center justify-between">
          <div>
            <h1 className="text-lg font-semibold tracking-tight text-gray-900">Operations Dashboard</h1>
            <p className="text-xs text-gray-600 mt-0.5">{import.meta.env.VITE_BUSINESS_NAME || 'Feel Good Pilates'}</p>
          </div>
          <div className="flex items-center gap-4">
            {lastRefresh && (
              <span className="hidden sm:block text-xs text-gray-600">
                Data from {isToday(lastRefresh) ? format(lastRefresh, 'h:mm a') : format(lastRefresh, 'EEE d MMM, h:mm a')}
              </span>
            )}
            <button
              onClick={onRefresh}
              disabled={anyLoading}
              className="flex items-center gap-1.5 rounded-lg bg-[#475AFF] px-3 py-1.5 text-sm font-medium text-white hover:bg-[#3547e6] disabled:opacity-50 transition-colors"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${anyLoading ? 'animate-spin' : ''}`} />
              Refresh
            </button>
          </div>
        </div>
      </header>

      {/* ── Tab nav ── */}
      <div className="sticky top-[65px] z-20 border-b border-gray-800 bg-gray-950">
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <nav className="flex gap-1 pt-1">
            {TABS.map(({ key, label, Icon }) => (
              <button
                key={key}
                onClick={() => setTab(key)}
                className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                  tab === key
                    ? 'border-[#475AFF] text-[#475AFF]'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                <Icon className="h-4 w-4" />
                {label}
              </button>
            ))}
          </nav>
        </div>
      </div>

      {/* ── Tab content ── */}
      <main className="mx-auto max-w-7xl px-4 sm:px-6 py-8 space-y-8">

        {/* ─ Operations ─ */}
        {tab === 'operations' && (
          <>
            <StatsGrid
              attendance={data.attendance}
              clientAnalytics={data.clientAnalytics}
              loading={loading}
            />
            <AttendanceChart />
            <SuspensionsList
              data={data.clientAnalytics}
              loading={loading.clientAnalytics}
              error={errors.clientAnalytics}
            />
            <RedsList
              data={data.clientAnalytics}
              loading={loading.clientAnalytics}
              error={errors.clientAnalytics}
              contactLog={contactLog}
              onboardingIds={onboardingIds}
            />
            <FringeClientsTable
              contactLog={contactLog}
              onboardingIds={onboardingIds}
            />
            <CelebrationsPanel
              data={data.celebrations}
              loading={loading.celebrations}
              error={errors.celebrations}
            />
          </>
        )}

        {/* ─ Finances ─ */}
        {tab === 'finances' && (
          <>
            <RevenueCards
              data={data.revenue}
              loading={loading.revenue}
              error={errors.revenue}
            />
            <DeclinedList
              data={data.clientAnalytics}
              loading={loading.clientAnalytics}
              error={errors.clientAnalytics}
            />
            <PaymentIssuesTable
              data={data.payments}
              loading={loading.payments}
              error={errors.payments}
            />
          </>
        )}
      </main>
    </div>
  );
}
