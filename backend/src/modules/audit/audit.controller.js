const prisma = require('../../lib/prisma');
const { verifyChain } = require('../../lib/auditLog');

async function list(req, res, next) {
  try {
    const take = Math.min(Number(req.query.limit) || 50, 200);
    const skip = Math.max(Number(req.query.offset) || 0, 0);
    const where = {};
    if (req.query.eventType) where.eventType = req.query.eventType;
    if (req.query.entityType) where.entityType = req.query.entityType;

    const [logs, total] = await Promise.all([
      prisma.auditLog.findMany({
        where,
        orderBy: { timestamp: 'desc' },
        take,
        skip,
        include: { actorUser: { select: { id: true, fullName: true, email: true } } },
      }),
      prisma.auditLog.count({ where }),
    ]);

    res.status(200).json({ logs, total, limit: take, offset: skip });
  } catch (err) {
    next(err);
  }
}

async function verify(req, res, next) {
  try {
    const result = await verifyChain(prisma);
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
}

module.exports = { list, verify };
