const prisma = require('../../lib/prisma');

// Round-trips through Prisma/Postgres rather than just returning 200, so this
// endpoint (and the Docker healthcheck that calls it) actually proves the
// database connection works — not just that the Node process is alive.
async function getHealth(req, res, next) {
  try {
    const record = await prisma.healthCheck.create({ data: {} });
    res.status(200).json({
      status: 'ok',
      database: 'connected',
      checkedAt: record.checkedAt,
    });
  } catch (err) {
    next(Object.assign(err, { status: 503 }));
  }
}

module.exports = { getHealth };
