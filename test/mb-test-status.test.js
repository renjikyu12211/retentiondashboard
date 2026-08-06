import assert from 'node:assert/strict';
import { buildMindbodyTestResult, getMindbodyEnvStatus } from '../netlify/functions/utils/mb-test-status.js';

const test = async () => {
  const status = getMindbodyEnvStatus({
    MINDBODY_API_KEY: 'ae51e80defd04fc0840e15ac174799e7',
    MINDBODY_SITE_ID: '-99',
    MINDBODY_USERNAME: 'renjikyu12211@gmail.com',
    MINDBODY_PASSWORD: 'Retentiondashboard2026',
  });

  assert.deepEqual(status, {
    hasApiKey: true,
    hasSiteId: true,
    hasUsername: true,
    hasPassword: true,
  });

  const result = buildMindbodyTestResult({
    MINDBODY_API_KEY: 'ae51e80defd04fc0840e15ac174799e7',
    MINDBODY_SITE_ID: '-99',
    MINDBODY_USERNAME: 'renjikyu12211@gmail.com',
    MINDBODY_PASSWORD: 'Retentiondashboard2026',
  });

  assert.equal(result.ok, true);
  assert.equal(result.message, 'Mindbody API credentials are configured.');

  const incomplete = buildMindbodyTestResult({ MINDBODY_API_KEY: 'ae51e80defd04fc0840e15ac174799e7' });
  assert.equal(incomplete.ok, false);
  assert.equal(incomplete.message, 'Mindbody API credentials are incomplete.');

  console.log('mb-test-status tests passed');
};

test().catch((err) => {
  console.error(err);
  process.exit(1);
});
