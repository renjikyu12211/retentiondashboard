import { useState, useEffect, useCallback } from 'react';
import Dashboard from './components/Dashboard.jsx';

// Initial load reads from the Netlify Blobs cache via GET /api/mb-snapshot.
// The Refresh button POSTs to /api/mb-snapshot to force a live pull + cache update.
// onboarding and pt are always fetched live (too dynamic to cache daily).
// If the snapshot is unavailable, each key falls back to its live endpoint.

const LOADING_ALL = { attendance: true, clientAnalytics: true, payments: true, revenue: true, onboarding: true, pt: true, celebrations: true };

const CACHED_ENDPOINTS = {
  attendance:      '/api/mb-attendance',
  clientAnalytics: '/api/mb-client-analytics',
  payments:        '/api/mb-payments',
  revenue:         '/api/mb-revenue',
};

async function fetchOnce(url, options) {
  const res = await fetch(url, options);
  if (!res.ok) {
    // Surface the server's error body (e.g. a timeout) instead of a bare
    // "HTTP 500" so panels explain what actually failed.
    let detail = '';
    try {
      const json = await res.json();
      detail = json?.error || json?.message || '';
    } catch { /* non-JSON body */ }
    const err = new Error(`HTTP ${res.status}${detail ? ` — ${detail}` : ''}`);
    err.status = res.status;
    throw err;
  }
  return res.json();
}

// Deduplicate concurrent calls to the same endpoint. On load, the snapshot
// and several panels can all request the heavy analytics function at once;
// each duplicate multiplies the work inside the 30s dev limit and causes
// timeouts. Sharing one in-flight promise per URL prevents the stampede.
const inFlight = new Map();

async function coordinatedFetch(url, options) {
  const key = `${options?.method || 'GET'}:${url}`;
  if (inFlight.has(key)) return inFlight.get(key);
  const promise = fetchOnce(url, options).finally(() => inFlight.delete(key));
  inFlight.set(key, promise);
  return promise;
}

// Retry transient server errors (500/502/503) — the heavy analytics function
// can exceed the dev-server's 30s limit under load, and a retry once the
// burst has passed almost always succeeds.
async function safeFetch(url, options, retries = 2) {
  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      return await coordinatedFetch(url, options);
    } catch (e) {
      lastErr = e;
      const retryable = e.status >= 500 || e.name === 'TypeError';
      if (!retryable || attempt === retries) throw e;
      await new Promise((r) => setTimeout(r, 1200 * (attempt + 1)));
    }
  }
  throw lastErr;
}

export default function App() {
  const [data, setData]               = useState({ attendance: null, clientAnalytics: null, payments: null, revenue: null, onboarding: null, pt: null, celebrations: null });
  const [loading, setLoading]         = useState(LOADING_ALL);
  const [errors, setErrors]           = useState({});
  const [lastRefresh, setLastRefresh] = useState(null);
  const [snapshotError, setSnapshotError] = useState(null);

  const refresh = useCallback((forceRefresh = false) => {
    setLoading(LOADING_ALL);
    setErrors({});

    const liveFetch = (key, url) =>
      safeFetch(url)
        .then(json => setData(prev => ({ ...prev, [key]: json })))
        .catch(e  => setErrors(prev => ({ ...prev, [key]: e.message })))
        .finally(() => setLoading(prev => ({ ...prev, [key]: false })));

    // Try snapshot for the 4 cached endpoints.
    // GET = serve from cache; POST = force live pull + update cache.
    // Falls back key-by-key (or entirely) to live calls if cache is incomplete.
    const cachedLoad = safeFetch('/api/mb-snapshot', { method: forceRefresh ? 'POST' : 'GET' })
      .then(snap => {
        if (snap.error) throw new Error(snap.error);
        setSnapshotError(null);
        const update  = {};
        const missing = [];
        for (const [key, url] of Object.entries(CACHED_ENDPOINTS)) {
          if (snap[key] != null) update[key] = snap[key];
          else missing.push([key, url]);
        }
        if (Object.keys(update).length) setData(prev => ({ ...prev, ...update }));
        return Promise.all(missing.map(([k, url]) => liveFetch(k, url)));
      })
      .catch((e) => {
        // Cache layer down — data still loads live, just slower. Say so.
        setSnapshotError(e.message);
        return Promise.all(Object.entries(CACHED_ENDPOINTS).map(([k, url]) => liveFetch(k, url)));
      })
      .finally(() =>
        setLoading(prev => ({ ...prev, attendance: false, clientAnalytics: false, payments: false, revenue: false }))
      );

    Promise.all([
      cachedLoad,
      liveFetch('onboarding',    '/api/mb-onboarding'),
      liveFetch('pt',            '/api/mb-pt-analytics'),
      liveFetch('celebrations',  '/api/mb-celebrations'),
    ]).then(() => setLastRefresh(new Date()));
  }, []);

  useEffect(() => { refresh(false); }, [refresh]);

  return (
    <Dashboard
      data={data}
      loading={loading}
      errors={errors}
      lastRefresh={lastRefresh}
      onRefresh={() => refresh(true)}
      snapshotError={snapshotError}
      onDismissSnapshotError={() => setSnapshotError(null)}
      contactLog={{ contacted: {}, isContacted: () => false, logContact: async () => ({ logged: false }), getClientLogs: async () => [], loadingLog: false }}
    />
  );
}
