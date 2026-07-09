// Shared by every module's service/middleware layer so error shape is
// consistent everywhere the centralized error handler (middleware/errorHandler.js)
// eventually catches it.
function httpError(status, message) {
  return Object.assign(new Error(message), { status });
}

module.exports = httpError;
