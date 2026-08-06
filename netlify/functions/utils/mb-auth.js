const MB_BASE = 'https://api.mindbodyonline.com/public/v6';

function fetchWithTimeout(url, options = {}, timeoutMs = 8000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  return fetch(url, { ...options, signal: controller.signal })
    .finally(() => clearTimeout(timer));
}

function getEnvValue(name) {
  return (process.env[name] || '')
    .toString()
    .trim()
    .replace(/^['"]|['"]$/g, '');
}

let activeSiteId = getEnvValue('MINDBODY_SITE_ID');

function normalizeSiteId(value) {
  return (value || '').toString().trim().replace(/^['"]|['"]$/g, '');
}

function getSiteIdCandidates() {
  const primary = normalizeSiteId(getEnvValue('MINDBODY_SITE_ID'));
  const candidates = [];
  if (primary) candidates.push(primary);
  if (!candidates.includes('5726188')) candidates.push('5726188');
  return candidates;
}

export function baseHeaders(siteId = activeSiteId) {
  return {
    'Content-Type': 'application/json',
    'Api-Key': getEnvValue('MINDBODY_API_KEY'),
    'SiteId': siteId,
  };
}

export async function getStaffToken() {
  const siteIds = getSiteIdCandidates();

  for (const siteId of siteIds) {
    const res = await fetchWithTimeout(`${MB_BASE}/usertoken/issue`, {
      method: 'POST',
      headers: baseHeaders(siteId),
      body: JSON.stringify({
        Username: getEnvValue('MINDBODY_USERNAME'),
        Password: getEnvValue('MINDBODY_PASSWORD'),
      }),
    }, 8000);

    const text = await res.text().catch(() => '');
    if (!res.ok) {
      const denied = res.status === 403 && (text.includes('DeniedAccess') || text.includes('You do not have access to siteId'));
      if (denied && siteId !== '5726188' && siteIds.includes('5726188')) {
        continue;
      }
      throw new Error(`Mindbody auth failed (${res.status}) for site ${siteId}: ${text}`);
    }

    try {
      const data = JSON.parse(text);
      const { AccessToken } = data;
      if (!AccessToken) {
        throw new Error(`Mindbody auth returned no access token: ${text}`);
      }
      activeSiteId = siteId;
      return AccessToken;
    } catch (e) {
      throw new Error(`Mindbody auth returned invalid JSON: ${text}`);
    }
  }

  throw new Error('Mindbody auth failed without a usable site ID');
}

export function authHeaders(token) {
  return { ...baseHeaders(activeSiteId), Authorization: `Bearer ${token}` };
}

export async function mbGet(path, token, params = {}) {
  const url = new URL(`${MB_BASE}${path}`);
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null) continue;
    if (Array.isArray(v)) {
      for (const item of v) url.searchParams.append(k, String(item));
    } else {
      url.searchParams.set(k, String(v));
    }
  }
  const res = await fetchWithTimeout(url.toString(), { headers: authHeaders(token) }, 10000);
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`MB GET ${path} → ${res.status}: ${body.slice(0, 300)}`);
  }
  return res.json();
}

export async function mbPost(path, token, body) {
  const res = await fetchWithTimeout(`${MB_BASE}${path}`, {
    method: 'POST',
    headers: authHeaders(token),
    body: JSON.stringify(body),
  }, 10000);
  if (!res.ok) throw new Error(`MB POST ${path} → ${res.status}`);
  return res.json();
}

// Australian phone numbers returned as JSON numbers lose their leading 0.
// Re-add it for any 9-digit number starting with 2–9 (AU mobile & landline pattern).
export function formatPhone(raw) {
  if (raw === null || raw === undefined || raw === '') return '';
  const s = String(raw).trim();
  if (s.length === 9 && /^[2-9]/.test(s)) return '0' + s;
  return s;
}

export const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Content-Type': 'application/json',
};

export function ok(body) {
  return { statusCode: 200, headers: CORS, body: JSON.stringify(body) };
}

export function err(message, status = 500) {
  return { statusCode: status, headers: CORS, body: JSON.stringify({ error: message }) };
}
