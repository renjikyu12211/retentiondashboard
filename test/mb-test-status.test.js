import assert from 'node:assert/strict';
import { buildMindbodyTestResult, getMindbodyEnvStatus } from '../netlify/functions/utils/mb-test-status.js';
import { buildFringeSegments, buildRedListClients, buildNoShowsList } from '../netlify/functions/mb-client-analytics.js';

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

  const reds = buildRedListClients({
    clientMap: {
      1: { Id: 1, FirstName: 'Amy', LastName: 'Adams', Active: true, Status: 'Active', Program: { Name: 'Membership' } },
      2: { Id: 2, FirstName: 'Ben', LastName: 'Brown', Active: true, Status: 'Active', Program: { Name: 'Class Pack' } },
      3: { Id: 3, FirstName: 'Cara', LastName: 'Clark', Active: false, Status: 'Inactive' },
      4: { Id: 4, FirstName: 'Drew', LastName: 'Diaz', Active: true, Status: 'Active', Program: { Name: 'Membership' } },
    },
    attendedClientIds: new Set(['1']),
    engagedClientIds: new Set(['1']),
    lastVisitDates: new Map([['4', '2024-01-02T12:00:00.000Z']]),
  });

  assert.deepEqual(reds.map((client) => client.id), ['3', '4']);
  assert.equal(reds.find((client) => client.id === '4').lastVisitDate, '2024-01-02T12:00:00.000Z');

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

  console.log('mb-test-status tests passed');
};

test().catch((err) => {
  console.error(err);
  process.exit(1);
});
