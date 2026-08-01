const env = require('../config/env');

const HCAPTCHA_VERIFY_URL = 'https://hcaptcha.com/siteverify';

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
