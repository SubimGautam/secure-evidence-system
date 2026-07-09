import apiClient from './client';

export function getDirectory() {
  return apiClient.get('/users/directory').then((r) => r.data.users);
}
