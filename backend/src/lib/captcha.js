const env = require('../config/env');

const HCAPTCHA_VERIFY_URL = 'https://hcaptcha.com/siteverify';

// Bot-mitigation for /auth/register and /auth/login, alongside rate limiting
// and account lockout (auth.service.js) — three independent layers so
// defeating one (e.g. distributing requests across IPs to dodge the rate
// limiter) still leaves the other two standing.
//
// Fails closed: CAPTCHA_ENABLED=false lets everything through (dev/CI with
// no keys provisioned), but once enabled, a missing token or a network
// error talking to hCaptcha both count as failure — never as "skip the
// check."
async function verifyCaptchaToken(token, remoteIp) {
  if (!env.CAPTCHA_ENABLED) return true;
  if (!token) return false;

  const params = new URLSearchParams({ secret: env.CAPTCHA_SECRET_KEY, response: token });
  if (remoteIp) params.set('remoteip', remoteIp);

  try {
    const res = await fetch(HCAPTCHA_VERIFY_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params,
    });
    if (!res.ok) return false;
    const data = await res.json();
    return data.success === true;
  } catch {
    return false;
  }
}

module.exports = { verifyCaptchaToken };
