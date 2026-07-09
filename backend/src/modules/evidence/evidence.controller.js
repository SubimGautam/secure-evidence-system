const httpError = require('../../lib/httpError');
const evidenceService = require('./evidence.service');

async function create(req, res, next) {
  try {
    const evidence = await evidenceService.createEvidence(req.user, req.body);
    res.status(201).json({ evidence });
  } catch (err) {
    next(err);
  }
}

async function list(req, res, next) {
  try {
    const evidence = await evidenceService.listEvidence();
    res.status(200).json({ evidence });
  } catch (err) {
    next(err);
  }
}

async function getOne(req, res, next) {
  try {
    const evidence = await evidenceService.getEvidenceById(req.params.id);
    if (!evidence) return res.status(404).json({ error: 'Evidence not found' });
    res.status(200).json({ evidence });
  } catch (err) {
    next(err);
  }
}

async function update(req, res, next) {
  try {
    // req.evidence was already loaded and ownership-checked by
    // requireEvidenceOwner — reusing its id avoids a redundant lookup.
    const evidence = await evidenceService.updateEvidence(req.evidence.id, req.body, req.user.id);
    res.status(200).json({ evidence });
  } catch (err) {
    next(err);
  }
}

// req.evidence for all four below was loaded and custodian-checked by
// requireCurrentCustodian — the ABAC layer confirms *who* may act; the
// service layer's transitionStatus() confirms the move is legal from the
// item's *current* status (409 if not, not a second authorization check).
async function confirmCollection(req, res, next) {
  try {
    const evidence = await evidenceService.confirmCollection(req.evidence, req.user.id);
    res.status(200).json({ evidence });
  } catch (err) {
    next(err);
  }
}

// req.evidence here was loaded and checked by requireEvidenceOwner, not
// requireCurrentCustodian — reopening is the original logging Officer's
// call, not whoever currently holds the item.
async function reopen(req, res, next) {
  try {
    const evidence = await evidenceService.reopenForCorrection(req.evidence, req.user.id);
    res.status(200).json({ evidence });
  } catch (err) {
    next(err);
  }
}

async function releaseForCourt(req, res, next) {
  try {
    const evidence = await evidenceService.releaseForCourt(req.evidence, req.user.id);
    res.status(200).json({ evidence });
  } catch (err) {
    next(err);
  }
}

async function markReturned(req, res, next) {
  try {
    const evidence = await evidenceService.markReturned(req.evidence, req.user.id);
    res.status(200).json({ evidence });
  } catch (err) {
    next(err);
  }
}

async function archive(req, res, next) {
  try {
    const evidence = await evidenceService.archiveEvidence(req.evidence, req.user.id);
    res.status(200).json({ evidence });
  } catch (err) {
    next(err);
  }
}

async function uploadFile(req, res, next) {
  try {
    if (!req.file) throw httpError(400, 'No file was uploaded (field name must be "file")');
    // req.evidence was loaded and custodian-checked by requireCurrentCustodian.
    const file = await evidenceService.uploadFile(req.evidence, req.user, req.file);
    res.status(201).json({
      file: {
        id: file.id,
        originalFilename: file.originalFilename,
        mimeType: file.mimeType,
        sizeBytes: file.sizeBytes,
        sha256Hash: file.sha256Hash,
        createdAt: file.createdAt,
      },
    });
  } catch (err) {
    next(err);
  }
}

async function downloadFile(req, res, next) {
  try {
    const { buffer, originalFilename, mimeType } = await evidenceService.downloadFile(
      req.params.id,
      req.params.fileId,
      req.user.id,
    );
    // The stored filename is untrusted input — stripping CR/LF and quotes is
    // enough to keep it from injecting extra headers here.
    const safeName = originalFilename.replace(/["\r\n]/g, '');
    res.setHeader('Content-Type', mimeType);
    res.setHeader('Content-Disposition', `attachment; filename="${safeName}"`);
    res.send(buffer);
  } catch (err) {
    next(err);
  }
}

module.exports = {
  create,
  list,
  getOne,
  update,
  confirmCollection,
  reopen,
  releaseForCourt,
  markReturned,
  archive,
  uploadFile,
  downloadFile,
};
