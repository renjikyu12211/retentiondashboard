import assert from 'node:assert/strict';
import { buildMindbodyTestResult, getMindbodyEnvStatus } from '../netlify/functions/utils/mb-test-status.js';
import { buildFringeSegments, buildRedListClients, buildNoShowsList, buildSuspensionsList, isRealAttendance } from '../netlify/functions/mb-client-analytics.js';

const test = async () => {
  const status = getMindbodyEnvStatus({
    MINDBODY_API_KEY: 'test-api-key',
    MINDBODY_SITE_ID: '123456',
    MINDBODY_USERNAME: 'staff@example.com',
    MINDBODY_PASSWORD: 'test-password',
  });

  assert.deepEqual(status, {
    hasApiKey: true,
    hasSiteId: true,
    hasUsername: true,
    hasPassword: true,
  });

  const result = buildMindbodyTestResult({
    MINDBODY_API_KEY: 'test-api-key',
    MINDBODY_SITE_ID: '123456',
    MINDBODY_USERNAME: 'staff@example.com',
    MINDBODY_PASSWORD: 'test-password',
  });

  assert.equal(result.ok, true);
  assert.equal(result.message, 'Mindbody API credentials are configured.');

  const incomplete = buildMindbodyTestResult({ MINDBODY_API_KEY: 'test-api-key' });
  assert.equal(incomplete.ok, false);
  assert.equal(incomplete.message, 'Mindbody API credentials are incomplete.');

  const fringe = buildFringeSegments({
    clientMap: {
      1: { Id: 1, FirstName: 'Amy', LastName: 'Adams', Active: true, Status: 'Active' },
      2: { Id: 2, FirstName: 'Ben', LastName: 'Brown', Active: true, Status: 'Active' },
      3: { Id: 3, FirstName: 'Cara', LastName: 'Clark', Active: true, Status: 'Active' },
      4: { Id: 4, FirstName: 'Drew', LastName: 'Diaz', Active: true, Status: 'Active' },
    },
    attendanceCounts: new Map([
      ['1', 2],
      ['2', 1],
      ['3', 3],
      ['4', 4],
    ]),
  });

  assert.equal(fringe.atRisk.count, 2);
  assert.equal(fringe.engaged.count, 2);
  assert.deepEqual(fringe.atRisk.clients.map((client) => client.id), ['1', '2']);
  assert.deepEqual(fringe.engaged.clients.map((client) => client.id), ['3', '4']);

  // Red's List = active members with no visit in the last 7 days.
  // Each entry must carry the member's real last-visit date (or null).
  const now = Date.now();
  const dayMs = 24 * 60 * 60 * 1000;
  const recentVisit = new Date(now - 2 * dayMs).toISOString();  // inside the 7-day window
  const oldVisit = new Date(now - 30 * dayMs).toISOString();    // outside the 7-day window
  const staleBefore = new Date(now - 7 * dayMs).toISOString();

  const reds = buildRedListClients({
    clientMap: {
      1: { Id: 1, FirstName: 'Amy', LastName: 'Adams', Active: true, Status: 'Active', Program: { Name: 'Membership' } },
      2: { Id: 2, FirstName: 'Ben', LastName: 'Brown', Active: true, Status: 'Active', Program: { Name: 'Class Pack' } },
      3: { Id: 3, FirstName: 'Cara', LastName: 'Clark', Active: false, Status: 'Inactive' },
      4: { Id: 4, FirstName: 'Drew', LastName: 'Diaz', Active: true, Status: 'Active', Program: { Name: 'Membership' } },
      5: { Id: 5, FirstName: 'Eli', LastName: 'Evans', Active: true, Status: 'Active', Program: { Name: 'Membership' } },
      6: { Id: 6, FirstName: 'Fay', LastName: 'Fox', Active: true, Status: 'Suspended' },
    },
    staleBefore,
    lastVisitDates: new Map([
      ['1', recentVisit],  // visited 2 days ago → must NOT appear
      ['4', oldVisit],     // last visit 30 days ago → appears, with that date
      ['6', oldVisit],     // suspended → excluded even though stale
    ]),
  });

  assert.deepEqual(reds.map((client) => client.id), ['4', '5']);
  assert.equal(reds.find((client) => client.id === '4').lastVisitDate, oldVisit);
  assert.equal(reds.find((client) => client.id === '5').lastVisitDate, null);

  // Only real attendance counts as a visit for last-visit purposes.
  assert.equal(isRealAttendance({ SignedIn: true, StartDateTime: recentVisit }), true);
  assert.equal(isRealAttendance({ LateCancelled: true }), false);
  assert.equal(isRealAttendance({ BookingStatus: 'NoShow' }), false);
  assert.equal(isRealAttendance({ Status: 'Absent' }), false);

  const noShows = buildNoShowsList({
    clientMap: {
      10: { Id: 10, FirstName: 'Eve', LastName: 'Edwards', Active: true, Status: 'Active' },
    },
    classes: [{ Id: 100, Name: 'Pilates', StartDateTime: '2024-01-02T10:00:00.000Z', Staff: { Name: 'Sam' } }],
    classVisits: {
      100: [{ ClientId: 10, SignedIn: false, BookingStatus: 'NoShow' }],
    },
  });

  assert.equal(noShows.length, 1);
  assert.equal(noShows[0].noShowCount, 1);
  assert.equal(noShows[0].sessions[0].className, 'Pilates');

  const suspensions = buildSuspensionsList({
    clientMap: {
      21: { Id: 21, FirstName: 'Frank', LastName: 'Foster', Active: true, Status: 'Active', HomeLocation: 'Home Studio', SuspensionInfo: { Reason: 'Member requested pause' } },
      22: { Id: 22, FirstName: 'Gina', LastName: 'Green', Active: true, Status: 'Suspended', HomeLocation: 'Studio 2' },
      23: { Id: 23, FirstName: 'Hank', LastName: 'Hale', Active: false, Status: 'Inactive', HomeLocation: 'Studio 4' },
      24: { Id: 24, FirstName: 'Ivy', LastName: 'Irwin', Active: true, Status: 'Active', HomeLocation: 'Studio 1' },
    },
  });

  assert.deepEqual(suspensions.map((client) => client.id), ['21', '22']);
  assert.equal(suspensions.find((client) => client.id === '21').status, 'Active');
  assert.equal(suspensions.find((client) => client.id === '22').status, 'Suspended');

  console.log('mb-test-status tests passed');
};

test().catch((err) => {
  console.error(err);
  process.exit(1);
});
