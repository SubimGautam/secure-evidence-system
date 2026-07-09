const { verifyAccessToken } = require('../lib/tokens');
const prisma = require('../lib/prisma');

// Loads the user fresh from the database on every request rather than
// trusting the JWT payload alone — a 15-minute access token is only a
// meaningful security boundary if a role change or account deactivation can
// still take effect before it expires.
async function authenticate(req, res, next) {
  try {
    const header = req.get('authorization') || '';
    const [scheme, token] = header.split(' ');
    if (scheme !== 'Bearer' || !token) {
      throw Object.assign(new Error('Missing or malformed Authorization header'), { status: 401 });
    }

    const payload = verifyAccessToken(token);

    const user = await prisma.user.findUnique({
      where: { id: payload.sub },
      include: { role: true },
    });

    if (!user || user.deletedAt) {
      throw Object.assign(new Error('Account no longer exists'), { status: 401 });
    }
    if (user.lockedUntil && user.lockedUntil > new Date()) {
      throw Object.assign(new Error('Account is temporarily locked'), { status: 401 });
    }

    req.user = {
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      role: user.role.name,
      sessionId: payload.sessionId,
    };
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError' || err.name === 'JsonWebTokenError') {
      return next(Object.assign(new Error('Invalid or expired access token'), { status: 401 }));
    }
    next(err.status ? err : Object.assign(err, { status: 401 }));
  }
}

module.exports = authenticate;
