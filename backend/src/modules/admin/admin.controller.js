const prisma = require('../../lib/prisma');

// Richer than the public /healthz (which only needs to answer "is the
// process up" for Docker) — this is an authenticated, Admin-only view for
// the dashboard, so it can safely include counts and environment info that
// /healthz shouldn't expose to an unauthenticated caller.
async function health(req, res, next) {
  try {
    let dbConnected = true;
    try {
      await prisma.$queryRaw`SELECT 1`;
    } catch {
      dbConnected = false;
    }

    const [userCount, evidenceCount, activeSessionCount, auditLogCount] = await Promise.all([
      prisma.user.count({ where: { deletedAt: null } }),
      prisma.evidence.count(),
      prisma.session.count({ where: { revokedAt: null, expiresAt: { gt: new Date() } } }),
      prisma.auditLog.count(),
    ]);

    res.status(200).json({
      status: dbConnected ? 'ok' : 'degraded',
      database: dbConnected ? 'connected' : 'unreachable',
      uptimeSeconds: Math.floor(process.uptime()),
      nodeEnv: process.env.NODE_ENV,
      counts: {
        activeUsers: userCount,
        evidenceItems: evidenceCount,
        activeSessions: activeSessionCount,
        auditLogEntries: auditLogCount,
      },
    });
  } catch (err) {
    next(err);
  }
}

module.exports = { health };
