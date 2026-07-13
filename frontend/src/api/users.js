import apiClient from './client';

export function getDirectory() {
  return apiClient.get('/users/directory').then((r) => r.data.users);
}

export function getOwnProfile() {
  return apiClient.get('/users/me').then((r) => r.data.user);
}

export function updateOwnProfile({ fullName }) {
  return apiClient.patch('/users/me', { fullName }).then((r) => r.data.user);
}

export function exportOwnData() {
  return apiClient.get('/users/me/export').then((r) => r.data);
}

export function importOwnProfile({ fullName }) {
  return apiClient.post('/users/me/import', { fullName }).then((r) => r.data.user);
}
