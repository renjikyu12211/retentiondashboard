import { useEffect, useMemo, useState } from 'react';
import { PauseCircle, CheckCircle, Calendar, ChevronDown } from 'lucide-react';

function statusColor(status) {
  const s = (status || '').toLowerCase();
  if (s.includes('suspend')) return 'text-orange-400 bg-orange-500/10 border-orange-500/20';
  if (s.includes('inactive') || s.includes('declined')) return 'text-red-400 bg-red-500/10 border-red-500/20';
  return 'text-gray-400 bg-gray-700/30 border-gray-700/50';
}

function resumeLabel(isoDate) {
  if (!isoDate) return null;
  let d;
  try { d = new Date(isoDate); } catch { return null; }
  if (isNaN(d.getTime())) return null;

  const now  = new Date();
  const days = Math.round((d - now) / 86400000);

  if (days < -1)  return `Ended ${d.toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })}`;
  if (days < 0)   return 'Ended yesterday';
  if (days === 0) return 'Resumes today';
  if (days === 1) return 'Resumes tomorrow';
  if (days < 60)  return `Resumes ${d.toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })} · ${days}d`;
  return `Resumes ${d.toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })}`;
}

function startDateLabel(info) {
  if (!info) return null;
  const raw =
    info.SuspendedDate || info.suspendedDate ||
    info.StartDate     || info.startDate     ||
    info.BookedDate    || info.bookedDate    ||
    null;
  if (!raw) return null;
  let d;
  try { d = new Date(raw); } catch { return null; }
  if (isNaN(d.getTime())) return null;
  return `From ${d.toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })}`;
}

const STUDIO_OPTIONS = ['All Studios', 'Carnegie', 'Ashburton', 'Surrey Hills', 'Hawthorn'];

export default function SuspensionsList({ data, loading, error }) {
  const [studioFilter, setStudioFilter] = useState('All Studios');
  const clients = data?.suspensions || [];

  const visibleClients = useMemo(() => {
    if (studioFilter === 'All Studios') return clients;
    return clients.filter((client) => {
      const location = String(client.mostVisitedLocation || client.homeLocation || '').trim();
      return location.toLowerCase().includes(studioFilter.toLowerCase());
    });
  }, [clients, studioFilter]);

  useEffect(() => {
    if (clients.length > 0) {
      console.log('[SuspensionsList] sample:', {
        resumeDate:     clients[0]?.resumeDate,
        suspensionInfo: clients[0]?.suspensionInfo,
        status:         clients[0]?.status,
        location:       clients[0]?.mostVisitedLocation || clients[0]?.homeLocation,
      });
    }
  }, [clients]);

  return (
    <div className="rounded-xl border border-gray-200 bg-white shadow-sm flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-gray-200">
        <div className="flex items-center gap-2">
          <PauseCircle className="h-4 w-4 text-orange-400" />
          <h2 className="font-semibold text-gray-900">On Suspension</h2>
          {!loading && (
            <span className="rounded-full bg-orange-500/10 px-2 py-0.5 text-xs font-medium text-orange-400 border border-orange-500/20">
              {visibleClients.length}
            </span>
          )}
        </div>
        <div className="relative">
          <select
            value={studioFilter}
            onChange={(e) => setStudioFilter(e.target.value)}
            className="appearance-none rounded-lg border border-gray-200 bg-white px-3 py-1.5 pr-8 text-xs text-gray-700 focus:border-orange-500 focus:outline-none"
          >
            {STUDIO_OPTIONS.map((option) => (
              <option key={option} value={option}>{option}</option>
            ))}
          </select>
          <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-500" />
        </div>
      </div>

      {/* Body */}
      <div className="overflow-y-auto max-h-72 scrollbar-thin">
        {loading && (
          <div className="space-y-2 p-5">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-12 animate-pulse rounded-lg bg-gray-200" />
            ))}
          </div>
        )}

        {error && !loading && (
          <p className="p-5 text-sm text-red-400">Could not load: {error}</p>
        )}

        {!loading && !error && visibleClients.length === 0 && (
          <div className="py-10 text-center">
            <CheckCircle className="h-7 w-7 text-emerald-500/40 mx-auto mb-2" />
            <p className="text-sm text-gray-600">No suspended clients</p>
          </div>
        )}

        {!loading && !error && visibleClients.map((client) => {
          const lbl      = resumeLabel(client.resumeDate || client.endDate);
          const startLbl = startDateLabel(client.suspensionInfo);
          const reason   = client.suspensionInfo?.Reason || client.suspensionInfo?.reason ||
                           (client.suspensionInfo?.ReasonId ? `Reason #${client.suspensionInfo.ReasonId}` : null);
          const studio   = client.mostVisitedLocation || client.homeLocation || 'Unassigned';

          return (
            <div
              key={client.id}
              className="px-5 py-3 border-b border-gray-200/80 last:border-0 hover:bg-gray-50 transition-colors"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm font-medium text-gray-900 truncate">{client.name || 'Unknown'}</p>
                    <span className={`shrink-0 rounded-full border px-2 py-0.5 text-xs font-medium ${statusColor(client.status)}`}>
                      {client.status || 'Suspended'}
                    </span>
                  </div>

                  <div className="mt-2 flex items-center justify-between gap-2 text-[11px] uppercase tracking-wide text-gray-500">
                    <span>Studio</span>
                    <span className="font-medium text-gray-700">{studio}</span>
                  </div>
                  <div className="mt-1 text-[10px] uppercase tracking-wide text-gray-400">
                    Count source: signed-in attendance
                  </div>

                  <div className="mt-2 rounded-lg border border-orange-200 bg-orange-50/70 px-3 py-2">
                    {lbl ? (
                      <p className="flex items-center gap-1.5 text-sm font-semibold text-orange-600">
                        <Calendar className="h-3.5 w-3.5 shrink-0" />
                        {lbl}
                      </p>
                    ) : (
                      <p className="text-sm font-semibold text-orange-600">No resume date set</p>
                    )}
                  </div>

                  {(reason || startLbl) && (
                    <div className="mt-2 space-y-1">
                      {reason && (
                        <p className="text-xs font-medium text-gray-700">
                          <span className="text-gray-500">Reason:</span> {reason}
                        </p>
                      )}
                      {startLbl && (
                        <p className="text-xs text-gray-600">{startLbl}</p>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
