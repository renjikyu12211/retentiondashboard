import { ok, err, CORS } from './utils/mb-auth.js';
import { buildMindbodyTestResult } from './utils/mb-test-status.js';

export const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: CORS, body: '' };

  try {
    const result = buildMindbodyTestResult();
    return ok(result);
  } catch (e) {
    console.error('mb-test:', e);
    return err(e.message);
  }
};
