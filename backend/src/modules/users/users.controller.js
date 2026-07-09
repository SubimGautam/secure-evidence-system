const usersService = require('./users.service');

async function list(req, res, next) {
  try {
    const users = await usersService.listUsers();
    res.status(200).json({ users });
  } catch (err) {
    next(err);
  }
}

async function directory(req, res, next) {
  try {
    const users = await usersService.listDirectory();
    res.status(200).json({ users });
  } catch (err) {
    next(err);
  }
}

async function updateRole(req, res, next) {
  try {
    const user = await usersService.updateRole(req.params.id, req.user.id, req.body.role);
    res.status(200).json({ user });
  } catch (err) {
    next(err);
  }
}

async function updateStatus(req, res, next) {
  try {
    const user = await usersService.updateStatus(req.params.id, req.user.id, req.body.isActive);
    res.status(200).json({ user });
  } catch (err) {
    next(err);
  }
}

async function lock(req, res, next) {
  try {
    const user = await usersService.lockUser(req.params.id, req.user.id);
    res.status(200).json({ user });
  } catch (err) {
    next(err);
  }
}

async function unlock(req, res, next) {
  try {
    const user = await usersService.unlockUser(req.params.id, req.user.id);
    res.status(200).json({ user });
  } catch (err) {
    next(err);
  }
}

async function resetMfa(req, res, next) {
  try {
    await usersService.resetUserMfa(req.params.id, req.user.id);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
}

async function listSessions(req, res, next) {
  try {
    const sessions = await usersService.listUserSessions(req.params.id);
    res.status(200).json({ sessions });
  } catch (err) {
    next(err);
  }
}

async function revokeSession(req, res, next) {
  try {
    await usersService.revokeUserSession(req.params.id, req.params.sessionId, req.user.id);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
}

module.exports = {
  list,
  directory,
  updateRole,
  updateStatus,
  lock,
  unlock,
  resetMfa,
  listSessions,
  revokeSession,
};
