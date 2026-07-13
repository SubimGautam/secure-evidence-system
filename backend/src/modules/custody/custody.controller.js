const custodyService = require('./custody.service');

async function initiate(req, res, next) {
  try {
    // req.evidence was loaded and custodian-checked by requireCurrentCustodian.
    const transfer = await custodyService.initiateTransfer(
      req.evidence,
      req.user,
      req.body.toUserId,
    );
    res.status(201).json({ transfer });
  } catch (err) {
    next(err);
  }
}

async function accept(req, res, next) {
  try {
    // req.transfer was loaded and recipient-checked by requireTransferRecipient.
    const transfer = await custodyService.respondToTransfer(req.transfer, true, req.user.id);
    res.status(200).json({ transfer });
  } catch (err) {
    next(err);
  }
}

async function reject(req, res, next) {
  try {
    const transfer = await custodyService.respondToTransfer(req.transfer, false, req.user.id);
    res.status(200).json({ transfer });
  } catch (err) {
    next(err);
  }
}

async function list(req, res, next) {
  try {
    const transfers = await custodyService.listAllTransfers();
    res.status(200).json({ transfers });
  } catch (err) {
    next(err);
  }
}

async function listIncoming(req, res, next) {
  try {
    const transfers = await custodyService.listIncomingTransfers(req.user.id);
    res.status(200).json({ transfers });
  } catch (err) {
    next(err);
  }
}

module.exports = { initiate, accept, reject, list, listIncoming };
