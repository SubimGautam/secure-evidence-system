import apiClient from './client';

export function listUsers() {
  return apiClient.get('/users').then((r) => r.data.users);
}

export function updateUserRole(userId, role) {
  return apiClient.patch(`/users/${userId}/role`, { role }).then((r) => r.data.user);
}

export function updateUserStatus(userId, isActive) {
  return apiClient.patch(`/users/${userId}/status`, { isActive }).then((r) => r.data.user);
}

export function lockUser(userId) {
  return apiClient.post(`/users/${userId}/lock`).then((r) => r.data.user);
}

export function unlockUser(userId) {
  return apiClient.post(`/users/${userId}/unlock`).then((r) => r.data.user);
}

export function resetUserMfa(userId) {
  return apiClient.post(`/users/${userId}/mfa/reset`);
}

export function listUserSessions(userId) {
  return apiClient.get(`/users/${userId}/sessions`).then((r) => r.data.sessions);
}

export function revokeUserSession(userId, sessionId) {
  return apiClient.delete(`/users/${userId}/sessions/${sessionId}`);
}

export function getSystemHealth() {
  return apiClient.get('/admin/health').then((r) => r.data);
}
