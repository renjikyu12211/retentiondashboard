/**
 * Red's List uses a simple 7-day inactivity view:
 * clients who have zero signed-in attendance in the last 7 days.
 */
import { subDays, endOfDay, format, startOfDay } from 'date-fns';
import { getStaffToken, mbGet, ok, CORS, formatPhone, getSiteIdCandidates } from './utils/mb-auth.js';

const MAX_RECENT_CLASSES = 50;
const MAX_CLIENTS = 2000;
const VISIT_BATCH_SIZE = 8;
const STUDIO_LOCATIONS = ['Carnegie', 'Ashburton', 'Surrey Hills', 'Hawthorn'];

function normalizeStatusText(value) {
  return String(value ?? '').trim().toLowerCase();
}

function isSuspendedStatusValue(value) {
  const status = normalizeStatusText(value);
  return /suspend|paused|hold|inactive|cancelled|canceled|expired|deactivated|past due/.test(status);
}

function isActiveStatusValue(value) {
  const status = normalizeStatusText(value);
  return status === 'active' || status.includes('active');
}

function collectStatusEntries(node, prefix = '') {
  const entries = [];
  if (!node || typeof node !== 'object') return entries;

  for (const [key, value] of Object.entries(node)) {
    const nextKey = prefix ? `${prefix}.${key}` : key;
    if (value && typeof value === 'object') {
      entries.push(...collectStatusEntries(value, nextKey));
      continue;
    }
    if (typeof value === 'string' || typeof value === 'number') {
      entries.push([nextKey, String(value)]);
    }
  }

  return entries;
}

function hasActiveMembershipStatus(client) {
  const status = normalizeStatusText(client.Status ?? client.status ?? '');
  return status === 'active' || status.includes('active');
}

function hasSuspendedContractOrServiceStatus(client) {
  const entries = collectStatusEntries(client);
  const suspended = entries.some(([key, value]) => {
    const normalizedKey = key.toLowerCase();
    const hasRelevantStatusField = /status|state/.test(normalizedKey) || /contract|pricing|service|plan|package|membership|account/.test(normalizedKey);
    return hasRelevantStatusField && isSuspendedStatusValue(value);
  });

  if (suspended) return true;

  const suspensionInfo = client.suspensionInfo || client.SuspensionInfo || null;
  const resumeDate = client.ResumeDate || client.resumeDate || client.Suspension?.EndDate || client.EndDate || client.endDate || null;
  return Boolean(suspensionInfo) || Boolean(resumeDate);
}

function getStudioName(value) {
  const raw = String(value ?? '').trim();
  if (!raw) return '';
  const match = STUDIO_LOCATIONS.find((studio) => raw.toLowerCase().includes(studio.toLowerCase()));
  return match || '';
}

function getMostVisitedLocation(clientId, locationCounts = new Map()) {
  const counts = locationCounts.get(String(clientId)) || new Map();
  const entries = [...counts.entries()].filter(([location]) => STUDIO_LOCATIONS.includes(location));
  if (!entries.length) return '';
  entries.sort((a, b) => b[1] - a[1]);
  return entries[0][0];
}

function getEmptyPayload(period) {
  return {
    period,
    reds: [],
    fringeSegments: {
      atRisk: { count: 0, clients: [] },
      engaged: { count: 0, clients: [] },
    },
    noShows: [],
    suspensions: [],
    declinedClients: [],
    summary: {
      redsCount: 0,
      visitedThisWeek: 0,
      noShowCount: 0,
      suspensionCount: 0,
      declinedCount: 0,
      totalTracked: 0,
    },
  };
}

async function getRecentClasses(token, startDate, endDate, maxClasses = MAX_RECENT_CLASSES) {
  const classes = [];
  let offset = 0;
  while (classes.length < maxClasses) {
    const data = await mbGet('/class/classes', token, {
      StartDateTime: format(startDate, "yyyy-MM-dd'T'00:00:00"),
      EndDateTime: format(endDate, "yyyy-MM-dd'T'23:59:59"),
      Limit: 100,
      Offset: offset,
    });
    const page = data.Classes || [];
    const relevant = page.filter((cls) => (cls.TotalBooked || 0) > 0);
    classes.push(...relevant);
    if (page.length < 100 || offset >= 800) break;
    offset += 100;
  }
  return classes.slice(0, maxClasses);
}

async function getClassVisits(token, classId) {
  try {
    const data = await mbGet('/class/classvisits', token, { ClassID: classId });
    return data.Class?.Visits || [];
  } catch {
    return [];
  }
}

function getVisitDate(visit) {
  const candidates = [visit.VisitDate, visit.VisitDateTime, visit.StartDateTime, visit.Date, visit.timestamp, visit.Timestamp];
  for (const value of candidates) {
    if (!value) continue;
    if (typeof value === 'string' && value.trim()) return value.trim();
    if (value instanceof Date) return value.toISOString();
  }
  return null;
}

async function getClientVisits(token, clientId) {
  try {
    // Fetch a page of visits and pick the most recent by date — the API's
    // default sort order isn't guaranteed, so we don't rely on Visits[0].
    const data = await mbGet('/client/clientvisits', token, { ClientId: clientId, Limit: 50 });
    return data.Visits || [];
  } catch {
    return [];
  }
}

async function getAllClients(token, maxClients = MAX_CLIENTS) {
  const clients = [];
  let offset = 0;
  while (clients.length < maxClients) {
    const data = await mbGet('/client/clients', token, {
      ActiveOnly: false,
      Limit: 200,
      Offset: offset,
    });
    const page = data.Clients || [];
    clients.push(...page);
    if (page.length < 200 || offset >= 1000) break;
    offset += 200;
  }
  return clients.slice(0, maxClients);
}

async function getClientsAcrossSites(siteIds, maxClients = MAX_CLIENTS) {
  const allClients = [];
  const seenIds = new Set();
  for (const siteId of siteIds) {
    try {
      const token = await getStaffToken(siteId);
      const clients = await getAllClients(token, Math.max(50, Math.floor(maxClients / Math.max(siteIds.length, 1))));
      for (const client of clients) {
        const key = String(client.Id || client.id || '');
        if (!key || seenIds.has(key)) continue;
        seenIds.add(key);
        allClients.push(client);
      }
    } catch (error) {
      console.warn(`[mb-client-analytics] failed to fetch clients for site ${siteId}:`, error.message);
    }
  }
  return allClients;
}

function getPricingOption(client) {
  const candidates = [
    client.PricingOption,
    client.PricingOptionName,
    client.Program?.Name,
    client.ProgramName,
    client.Membership?.Name,
    client.MembershipName,
    client.CurrentMembership?.Name,
    client.CurrentMembershipName,
    client.Memberships?.[0]?.Name,
  ];

  for (const value of candidates) {
    if (typeof value === 'string' && value.trim()) return value.trim();
    if (value && typeof value === 'object' && value.Name) return value.Name;
  }

  return '';
}

function looksLikeMembershipOption(value = '') {
  const text = String(value).toLowerCase();
  return /membership|member|monthly|month|annual|year|unlimited/.test(text);
}

function getHomeLocation(client) {
  const value = client.HomeLocation || client.homeLocation || client.Location;
  if (typeof value === 'string' && value.trim()) return value.trim();
  if (value && typeof value === 'object' && value.Name) return value.Name.trim();
  return '';
}

function isLikelyActiveClient(client) {
  const status = (client.Status || client.status || '').toLowerCase();
  return status === 'active';
}

function hasActiveMemberStatus(client) {
  const status = String(client.Status || client.status || '').toLowerCase();
  const homeLocation = getHomeLocation(client);
  const isActiveFlag = client.Active !== false;
  const isActiveStatus = status === 'active' || status.includes('active');
  const hasStudioHomeLocation = /home studio|studio/i.test(homeLocation);
  return isActiveFlag && (isActiveStatus || hasStudioHomeLocation);
}

function mapClientToShape(client, lastVisitDate = null) {
  return {
    id: String(client.Id || client.id),
    name: `${client.FirstName || client.firstName || ''} ${client.LastName || client.lastName || ''}`.trim() || client.name || 'Unknown',
    email: client.Email || client.email || '',
    phone: formatPhone(client.MobilePhone || client.HomePhone || client.phone || ''),
    status: client.Status || client.status || 'Active',
    service: '',
    pricingOption: getPricingOption(client),
    homeLocation: getHomeLocation(client),
    lastVisitDate,
    trend: { direction: 'new', avg: 0 },
    lastSessionDate: lastVisitDate,
    weeklyAttendance: { w1: 0, w2: 0, w3: 0, w4: 0 },
  };
}

export function buildSuspensionsList({ clientMap, locationCounts = new Map() }) {
  return Object.values(clientMap)
    .filter((client) => {
      const status = normalizeStatusText(client.Status || client.status || '');
      const suspensionInfo = client.suspensionInfo || client.SuspensionInfo || null;
      const resumeDate = client.ResumeDate || client.resumeDate || client.suspensionInfo?.ResumeDate || client.suspensionInfo?.resumeDate || client.Suspension?.EndDate || client.EndDate || client.endDate || null;
      const hasSuspensionSignal =
        status.includes('suspend') ||
        status.includes('hold') ||
        status.includes('paused') ||
        Boolean(suspensionInfo) ||
        Boolean(resumeDate) ||
        hasSuspendedContractOrServiceStatus(client);

      return hasActiveMembershipStatus(client) && hasSuspensionSignal;
    })
    .map((client) => {
      const id = String(client.Id || client.id);
      const resumeDate = client.ResumeDate || client.resumeDate || client.suspensionInfo?.ResumeDate || client.suspensionInfo?.resumeDate || client.Suspension?.EndDate || client.SuspensionInfo?.EndDate || client.EndDate || client.endDate || null;
      return {
        ...mapClientToShape(client),
        suspensionInfo: client.suspensionInfo || client.SuspensionInfo || null,
        resumeDate,
        endDate: resumeDate,
        mostVisitedLocation: getMostVisitedLocation(id, locationCounts) || getHomeLocation(client) || '',
        status: client.Status || client.status || 'Suspended',
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function buildRedListClients({ clientMap, staleBefore, lastVisitDates = new Map() }) {
  const cutoff = staleBefore ? new Date(staleBefore).toISOString() : null;
  const redList = Object.values(clientMap)
    .filter((client) => {
      const id = String(client.Id || client.id);
      const status = String(client.Status || client.status || '').toLowerCase();
      const isSuspended = status.includes('suspend') || status.includes('hold');
      const isActive = isLikelyActiveClient(client) && !isSuspended;
      // Pricing option is often missing from the base client record — only
      // exclude when we positively know it's a non-membership product.
      const pricingOption = getPricingOption(client);
      const hasMembership = !pricingOption || looksLikeMembershipOption(pricingOption);
      const lastVisit = lastVisitDates.get(id) || null;
      // Red = never visited, or last visit was before the 7-day cutoff
      const isStale = !lastVisit || (cutoff && lastVisit < cutoff);
      return isActive && hasMembership && isStale;
    })
    .map((client) => mapClientToShape(client, lastVisitDates.get(String(client.Id || client.id)) || null));
  return redList.sort((a, b) => a.name.localeCompare(b.name));
}

export function buildFringeSegments({ clientMap, attendanceCounts }) {
  const atRisk = [];
  const engaged = [];

  for (const client of Object.values(clientMap)) {
    const id = String(client.Id || client.id);
    const count = attendanceCounts.get(id) || 0;
    const shape = mapClientToShape(client);
    shape.sessionsThisWeek = count;

    if (count >= 1 && count <= 3) {
      atRisk.push(shape);
    } else if (count > 3) {
      engaged.push(shape);
    }
  }

  return {
    atRisk: { count: atRisk.length, clients: atRisk.sort((a, b) => a.name.localeCompare(b.name)) },
    engaged: { count: engaged.length, clients: engaged.sort((a, b) => a.name.localeCompare(b.name)) },
  };
}

export function buildNoShowsList({ clientMap, classes, classVisits }) {
  const byClient = new Map();

  for (const cls of classes || []) {
    const classId = String(cls.Id || cls.id);
    const visits = classVisits?.[classId] || [];
    for (const visit of visits) {
      const clientId = String(visit.ClientId || visit.clientId || '');
      if (!clientId) continue;

      const status = String(visit.Status || visit.BookingStatus || '').toLowerCase();
      const signedIn = visit.SignedIn === true;
      const isNoShowOrAbsent = /absent|noshow|no show|no-show/i.test(status) || visit.NoShow === true || visit.IsNoShow === true;
      if (!isNoShowOrAbsent) continue;

      if (!byClient.has(clientId)) {
        const client = clientMap?.[clientId] || null;
        byClient.set(clientId, {
          id: clientId,
          name: client ? `${client.FirstName || client.firstName || ''} ${client.LastName || client.lastName || ''}`.trim() || 'Unknown' : 'Unknown',
          email: client?.Email || client?.email || '',
          phone: formatPhone(client?.MobilePhone || client?.HomePhone || client?.phone || ''),
          noShowCount: 0,
          sessions: [],
        });
      }

      const entry = byClient.get(clientId);
      entry.noShowCount += 1;
      entry.sessions.push({
        className: cls.Name || cls.name || 'Class',
        day: cls.StartDateTime ? format(new Date(cls.StartDateTime), 'EEE') : '',
        time: cls.StartDateTime ? format(new Date(cls.StartDateTime), 'p') : '',
        staffName: cls.Staff?.Name || cls.staffName || '',
      });
    }
  }

  return Array.from(byClient.values()).sort((a, b) => a.name.localeCompare(b.name));
}

export const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: CORS, body: '' };

  try {
    const period = event.queryStringParameters?.period || '7days';
    const siteIds = getSiteIdCandidates();
    const now = new Date();
    const startDate = startOfDay(subDays(now, 7));
    const endDate = endOfDay(now);

    const clients = await getClientsAcrossSites(siteIds);
    const clientMap = Object.fromEntries(clients.map((client) => [String(client.Id || client.id), client]));

    const recentClasses = [];
    const classVisitMap = {};
    const engagedClientIds = new Set();
    const lastVisitDates = new Map();
    const clientLocationCounts = new Map();

    for (const siteId of siteIds) {
      try {
        const token = await getStaffToken(siteId);
        const classes = await getRecentClasses(token, startDate, endDate);
        recentClasses.push(...classes);

        for (let index = 0; index < classes.length; index += VISIT_BATCH_SIZE) {
          const batch = classes.slice(index, index + VISIT_BATCH_SIZE);
          const results = await Promise.allSettled(batch.map((cls) => getClassVisits(token, cls.Id)));

          for (let i = 0; i < results.length; i += 1) {
            const cls = batch[i];
            const result = results[i];
            if (result.status !== 'fulfilled') continue;
            const visits = result.value || [];
            classVisitMap[String(cls.Id || cls.id)] = visits;

            for (const visit of visits) {
              const clientId = visit.ClientId || visit.clientId;
              if (!clientId) continue;

              const status = String(visit.Status || visit.BookingStatus || '').toLowerCase();
              const isCancelled = visit.LateCancelled === true || visit.Cancelled === true || /cancel/i.test(status);
              const signedIn = visit.SignedIn === true || /signed in/i.test(status);

              if (!isCancelled) {
                engagedClientIds.add(String(clientId));
              }

              if (signedIn) {
                const studioName = getStudioName(cls.Location || cls.location || cls.Studio?.Name || cls.StudioName || cls.LocationName || cls.SiteName || cls.locationName || '');
                if (studioName) {
                  const counts = clientLocationCounts.get(String(clientId)) || new Map();
                  counts.set(studioName, (counts.get(studioName) || 0) + 1);
                  clientLocationCounts.set(String(clientId), counts);
                }
              }

              const visitDate = getVisitDate(visit);
              if (visitDate) {
                const existing = lastVisitDates.get(String(clientId));
                if (!existing || visitDate > existing) {
                  lastVisitDates.set(String(clientId), visitDate);
                }
              }
            }
          }
        }
      } catch (error) {
        console.warn(`[mb-client-analytics] failed to fetch classes for site ${siteId}:`, error.message);
      }
    }

    // Only look up last-visit dates for clients who are active and didn't
    // attend a class this week — the pool that could end up on Red's List.
    const MAX_RED_CANDIDATES = 400;
    const RED_LOOKUP_BATCH_SIZE = 25;
    const redCandidateIds = clients
      .map((c) => String(c.Id || c.id))
      .filter((id) => id && !engagedClientIds.has(id) && isLikelyActiveClient(clientMap[id] || {}))
      .slice(0, MAX_RED_CANDIDATES);

    for (const siteId of siteIds) {
      try {
        const token = await getStaffToken(siteId);
        for (let index = 0; index < redCandidateIds.length; index += RED_LOOKUP_BATCH_SIZE) {
          const batch = redCandidateIds.slice(index, index + RED_LOOKUP_BATCH_SIZE);
          const results = await Promise.allSettled(batch.map((clientId) => getClientVisits(token, clientId)));
          for (let i = 0; i < batch.length; i += 1) {
            if (results[i].status !== 'fulfilled') continue;
            for (const visit of results[i].value) {
              const visitDate = getVisitDate(visit);
              if (!visitDate) continue;
              const clientId = String(batch[i]);
              const existing = lastVisitDates.get(clientId);
              if (!existing || visitDate > existing) lastVisitDates.set(clientId, visitDate);
            }
          }
        }
      } catch (error) {
        console.warn(`[mb-client-analytics] failed to fetch client visits/memberships for site ${siteId}:`, error.message);
      }
    }
    const attendanceCounts = new Map();
    for (const clientId of engagedClientIds) {
      attendanceCounts.set(clientId, (attendanceCounts.get(clientId) || 0) + 1);
    }
    const reds = buildRedListClients({ clientMap, staleBefore: startDate, lastVisitDates });
    const fringeSegments = buildFringeSegments({ clientMap, attendanceCounts });
    const noShows = buildNoShowsList({ clientMap, classes: recentClasses, classVisits: classVisitMap });
    const suspensions = buildSuspensionsList({ clientMap, locationCounts: clientLocationCounts });

    return ok({
      ...getEmptyPayload(period),
      reds,
      fringeSegments,
      noShows,
      suspensions,
      summary: {
        redsCount: reds.length,
        visitedThisWeek: engagedClientIds.size,
        noShowCount: noShows.length,
        suspensionCount: suspensions.length,
        declinedCount: 0,
        totalTracked: clients.length,
      },
    });
  } catch (e) {
    console.error('mb-client-analytics:', e);
    return ok(getEmptyPayload(event.queryStringParameters?.period || '7days'));
  }
};
