const prisma = require('../lib/prisma');
const httpError = require('../lib/httpError');

function requireResourceAttribute({ model, idParam = 'id', attachAs, allow }) {
  return async (req, res, next) => {
    if (!req.user) return next(httpError(401, 'Authentication required'));
    try {
      const resource = await prisma[model].findUnique({ where: { id: req.params[idParam] } });
      if (!resource) return next(httpError(404, `${model} not found`));

      if (req.user.role !== 'ADMIN' && !allow(resource, req.user)) {
        return next(httpError(403, 'You do not have permission to perform this action'));
      }
      req[attachAs] = resource;
      next();
    } catch (err) {
      next(err);
    }
  };
}
const requireEvidenceOwner = requireResourceAttribute({
  model: 'evidence',
  attachAs: 'evidence',
  allow: (evidence, user) =>
    evidence.loggedById === user.id && ['PENDING', 'COLLECTED'].includes(evidence.status),
});

const requireCurrentCustodian = requireResourceAttribute({
  model: 'evidence',
  attachAs: 'evidence',
  allow: (evidence, user) => evidence.currentCustodianId === user.id,
});

const requireTransferRecipient = requireResourceAttribute({
  model: 'custodyTransfer',
  attachAs: 'transfer',
  allow: (transfer, user) => transfer.toUserId === user.id,
});

module.exports = {
  requireResourceAttribute,
  requireEvidenceOwner,
  requireCurrentCustodian,
  requireTransferRecipient,
};
