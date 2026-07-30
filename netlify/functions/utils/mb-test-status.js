export function getMindbodyEnvStatus(env = process.env) {
  return {
    hasApiKey: Boolean(env.MINDBODY_API_KEY),
    hasSiteId: Boolean(env.MINDBODY_SITE_ID),
    hasUsername: Boolean(env.MINDBODY_USERNAME),
    hasPassword: Boolean(env.MINDBODY_PASSWORD),
  };
}

export function buildMindbodyTestResult(env = process.env) {
  const status = getMindbodyEnvStatus(env);
  const configured = Object.values(status).every(Boolean);

  return {
    ok: configured,
    configured: status,
    message: configured
      ? 'Mindbody API credentials are configured.'
      : 'Mindbody API credentials are incomplete.',
  };
}
