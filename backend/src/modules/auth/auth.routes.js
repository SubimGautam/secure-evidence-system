const { Router } = require('express');
const validate = require('../../middleware/validate');
const authenticate = require('../../middleware/authenticate');
const { createAuthLimiter } = require('../../middleware/rateLimiter');
const verifyOrigin = require('../../middleware/verifyOrigin');
const requireCaptcha = require('../../middleware/captcha');
const controller = require('./auth.controller');
const {
  registerSchema,
  loginSchema,
  mfaLoginSchema,
  mfaVerifySchema,
  mfaDisableSchema,
  passwordResetRequestSchema,
  passwordResetConfirmSchema,
} = require('./auth.validation');

const router = Router();

// validate() runs first so captchaToken is a known, typed field by the time
// requireCaptcha() reads it off req.body — order matters, not just style.
router.post(
  '/register',
  createAuthLimiter(),
  validate(registerSchema),
  requireCaptcha(),
  controller.register,
);
router.post(
  '/login',
  createAuthLimiter(),
  validate(loginSchema),
  requireCaptcha(),
  controller.login,
);
router.post('/login/mfa', createAuthLimiter(), validate(mfaLoginSchema), controller.loginMfa);

// Not rate-limited by authLimiter: refresh requires possession of the
// HttpOnly cookie already, so it isn't a credential-guessing target the way
// login/register are — see architecture doc §3. verifyOrigin *is* applied,
// though: these are the only two routes that authenticate via cookie alone
// (no Bearer header a cross-site request couldn't attach anyway), so they're
// the ones that actually benefit from an extra CSRF check.
router.post('/refresh', verifyOrigin, controller.refresh);
router.post('/logout', verifyOrigin, controller.logout);

router.post('/mfa/setup', authenticate, controller.mfaSetup);
router.post('/mfa/verify', authenticate, validate(mfaVerifySchema), controller.mfaVerify);
router.post('/mfa/disable', authenticate, validate(mfaDisableSchema), controller.mfaDisable);

router.get('/sessions', authenticate, controller.listSessions);
router.delete('/sessions/other', authenticate, controller.revokeOtherSessions);
router.delete('/sessions/:id', authenticate, controller.revokeSession);

router.post(
  '/password-reset/request',
  createAuthLimiter(),
  validate(passwordResetRequestSchema),
  controller.passwordResetRequest,
);
router.post(
  '/password-reset/confirm',
  createAuthLimiter(),
  validate(passwordResetConfirmSchema),
  controller.passwordResetConfirm,
);

module.exports = router;
