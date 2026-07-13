const httpError = require('../lib/httpError');
const { verifyCaptchaToken } = require('../lib/captcha');

function requireCaptcha() {
  return async (req, res, next) => {
    try {
      const ok = await verifyCaptchaToken(req.body.captchaToken, req.ip);
      if (!ok) throw httpError(400, 'CAPTCHA verification failed');
      next();
    } catch (err) {
      next(err);
    }
  };
}

module.exports = requireCaptcha;
