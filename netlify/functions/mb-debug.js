import { ok, err, CORS } from './utils/mb-auth.js';

export const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: CORS, body: '' };

  try {
    const payload = {
      hasApiKey: Boolean(process.env.MINDBODY_API_KEY),
      hasSiteId: Boolean(process.env.MINDBODY_SITE_ID),
      hasUsername: Boolean(process.env.MINDBODY_USERNAME),
      hasPassword: Boolean(process.env.MINDBODY_PASSWORD),
      apiKeyPrefix: process.env.MINDBODY_API_KEY ? process.env.MINDBODY_API_KEY.slice(0, 8) : null,
      siteId: process.env.MINDBODY_SITE_ID || null,
      username: process.env.MINDBODY_USERNAME || null,
    };

    return ok(payload);
  } catch (e) {
    return err(e.message);
  }
};
