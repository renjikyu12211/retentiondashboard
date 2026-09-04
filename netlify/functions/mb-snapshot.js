/**
 * GET  /api/mb-snapshot  → returns cached dashboard data (Netlify Blobs)
 * POST /api/mb-snapshot  → forces a live refresh, updates cache, returns fresh data
 *
 * If no cache exists (first ever load) a live fetch is triggered automatically.
 */
import { getStore } from '@netlify/blobs';
import { ok, err, CORS } from './utils/mb-auth.js';
import { handler as attendanceHandler } from './mb-attendance.js';
import { handler as clientAnalyticsHandler } from './mb-client-analytics.js';
import { handler as paymentsHandler } from './mb-payments.js';
import { handler as revenueHandler } from './mb-revenue.js';

const STORE_KEY = 'dashboard-snapshot';

// Netlify Blobs needs a siteID+token when running outside a deployed site
// (e.g. bare `netlify dev` without linking). Without it getStore() throws,
// so guard every store call and degrade to live fetches instead of a 500.
function tryGetStore() {
  try {
    return getStore('dashboard-cache');
  } catch (e) {
    console.warn('[mb-snapshot] Netlify Blobs unavailable, falling back to live fetches:', e.message);
    return null;
  }
}

// Invoke a sibling function in-process and parse its Netlify-style response.
// HTTP self-calls hang under the single-threaded `netlify dev` runtime, so we
// call the handlers directly instead of fetching /api/<fn> over HTTP.
const LIVE_EVENT = { httpMethod: 'GET', queryStringParameters: {} };

async function invoke(handlerFn) {
  try {
    const res = await handlerFn(LIVE_EVENT);
    if (!res || res.statusCode >= 400 || !res.body) return null;
    return JSON.parse(res.body);
  } catch (e) {
    console.warn('[mb-snapshot] sibling invocation failed:', e.message);
    return null;
  }
}

async function fetchAll() {
  const [att, ana, pay, rev] = await Promise.allSettled([
    invoke(attendanceHandler),
    invoke(clientAnalyticsHandler),
    invoke(paymentsHandler),
    invoke(revenueHandler),
  ]);

  return {
    attendance:      att.status === 'fulfilled' ? att.value : null,
    clientAnalytics: ana.status === 'fulfilled' ? ana.value : null,
    payments:        pay.status === 'fulfilled' ? pay.value : null,
    revenue:         rev.status === 'fulfilled' ? rev.value : null,
    cachedAt:        new Date().toISOString(),
  };
}

export const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: CORS, body: '' };

  try {
    const store = tryGetStore();

    // Force refresh (manual Refresh button)
    if (event.httpMethod === 'POST') {
      const snapshot = await fetchAll();
      if (store) {
        try { await store.set(STORE_KEY, JSON.stringify(snapshot)); } catch (e) { console.warn('[mb-snapshot] cache write failed:', e.message); }
      }
      return ok(snapshot);
    }

    // Serve from cache (page load)
    if (store) {
      try {
        const raw = await store.get(STORE_KEY);
        if (raw) return ok(JSON.parse(raw));
      } catch (e) {
        console.warn('[mb-snapshot] cache read failed:', e.message);
      }
    }

    // No cache (or cache unavailable) — fetch live, prime cache when possible
    const snapshot = await fetchAll();
    if (store) {
      try { await store.set(STORE_KEY, JSON.stringify(snapshot)); } catch (e) { console.warn('[mb-snapshot] cache write failed:', e.message); }
    }
    return ok(snapshot);
  } catch (e) {
    console.error('mb-snapshot:', e);
    return err(e.message);
  }
};
