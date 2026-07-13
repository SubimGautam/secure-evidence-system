const env = require('../../config/env');
const authService = require('./auth.service');
const mfaService = require('./mfa.service');
const sessionService = require('./session.service');
const passwordResetService = require('./passwordReset.service');

const REFRESH_COOKIE_NAME = 'refresh_token';
const REFRESH_COOKIE_PATH = '/api/v1/auth';

function setRefreshCookie(res, rawToken, expiresAt) {
  res.cookie(REFRESH_COOKIE_NAME, rawToken, {
    httpOnly: true,
    secure: env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: REFRESH_COOKIE_PATH,
    expires: expiresAt,
  });
}

function clearRefreshCookie(res) {
  res.clearCookie(REFRESH_COOKIE_NAME, { path: REFRESH_COOKIE_PATH });
}

function clientMeta(req) {
  return { ip: req.ip, userAgent: req.get('user-agent') || null };
}

async function register(req, res, next) {
  try {
    const user = await authService.register(req.body);
    res.status(201).json({ user });
  } catch (err) {
    next(err);
  }
}

async function login(req, res, next) {
  try {
    const result = await authService.login({ ...req.body, ...clientMeta(req) });

    if (result.mfaRequired) {
      return res.status(200).json({ mfaRequired: true, mfaToken: result.mfaToken });
    }

    setRefreshCookie(res, result.refreshToken, result.refreshTokenExpiresAt);
    res
      .status(200)
      .json({ mfaRequired: false, accessToken: result.accessToken, user: result.user });
  } catch (err) {
    next(err);
  }
}

async function loginMfa(req, res, next) {
  try {
    const result = await mfaService.loginWithMfa({ ...req.body, ...clientMeta(req) });
    setRefreshCookie(res, result.refreshToken, result.refreshTokenExpiresAt);
    res.status(200).json({ accessToken: result.accessToken, user: result.user });
  } catch (err) {
    next(err);
  }
}

async function refresh(req, res, next) {
  try {
    const rawToken = req.cookies[REFRESH_COOKIE_NAME];
    const result = await authService.refresh({ rawToken, ...clientMeta(req) });
    setRefreshCookie(res, result.refreshToken, result.refreshTokenExpiresAt);
    res.status(200).json({ accessToken: result.accessToken, user: result.user });
  } catch (err) {
    // A reuse-detected/expired/invalid refresh token means the client's
    // cookie is worthless going forward — dropping it here avoids a loop of
    // the browser resubmitting a token that will only ever be rejected.
    clearRefreshCookie(res);
    next(err);
  }
}

async function logout(req, res, next) {
  try {
    const rawToken = req.cookies[REFRESH_COOKIE_NAME];
    await authService.logout({ rawToken });
    clearRefreshCookie(res);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
}

async function mfaSetup(req, res, next) {
  try {
    const result = await mfaService.setupMfa(req.user.id, req.user.email);
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
}

async function mfaVerify(req, res, next) {
  try {
    const result = await mfaService.verifyMfaSetup(req.user.id, req.body.code);
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
}

async function mfaDisable(req, res, next) {
  try {
    await mfaService.disableMfa(req.user.id, req.body);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
}

async function listSessions(req, res, next) {
  try {
    const sessions = await sessionService.listSessions(req.user.id);
    res.status(200).json({
      sessions: sessions.map((s) => ({ ...s, current: s.id === req.user.sessionId })),
    });
  } catch (err) {
    next(err);
  }
}

async function revokeSession(req, res, next) {
  try {
    await sessionService.revokeSession(req.user.id, req.params.id);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
}

async function revokeOtherSessions(req, res, next) {
  try {
    const count = await sessionService.revokeOtherSessions(req.user.id, req.user.sessionId);
    res.status(200).json({ revokedCount: count });
  } catch (err) {
    next(err);
  }
}

async function passwordResetRequest(req, res, next) {
  try {
    await passwordResetService.requestPasswordReset(req.body.email);
    res.status(200).json({ message: 'If that email is registered, a reset link has been sent.' });
  } catch (err) {
    next(err);
  }
}

async function passwordResetConfirm(req, res, next) {
  try {
    await passwordResetService.confirmPasswordReset(req.body.token, req.body.newPassword);
    res.status(200).json({ message: 'Password has been reset. Please log in again.' });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  register,
  login,
  loginMfa,
  refresh,
  logout,
  mfaSetup,
  mfaVerify,
  mfaDisable,
  listSessions,
  revokeSession,
  revokeOtherSessions,
  passwordResetRequest,
  passwordResetConfirm,
};
