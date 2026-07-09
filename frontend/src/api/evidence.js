import apiClient from './client';

export function listEvidence() {
  return apiClient.get('/evidence').then((r) => r.data.evidence);
}

export function getEvidence(id) {
  return apiClient.get(`/evidence/${id}`).then((r) => r.data.evidence);
}

export function createEvidence(data) {
  return apiClient.post('/evidence', data).then((r) => r.data.evidence);
}

export function updateEvidence(id, data) {
  return apiClient.patch(`/evidence/${id}`, data).then((r) => r.data.evidence);
}

export function confirmCollection(id) {
  return apiClient.post(`/evidence/${id}/confirm`).then((r) => r.data.evidence);
}

export function reopenForCorrection(id) {
  return apiClient.post(`/evidence/${id}/reopen`).then((r) => r.data.evidence);
}

export function releaseForCourt(id) {
  return apiClient.post(`/evidence/${id}/release`).then((r) => r.data.evidence);
}

export function markReturned(id) {
  return apiClient.post(`/evidence/${id}/return`).then((r) => r.data.evidence);
}

export function archiveEvidence(id) {
  return apiClient.post(`/evidence/${id}/archive`).then((r) => r.data.evidence);
}

export function uploadEvidenceFile(id, file, onUploadProgress) {
  const formData = new FormData();
  formData.append('file', file);
  return apiClient
    .post(`/evidence/${id}/files`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
      onUploadProgress,
    })
    .then((r) => r.data.file);
}

// Downloads and hands back an object URL the caller can point an <a> tag or
// window.open at — the endpoint is authenticated (Bearer header), so a plain
// <a href> straight to the API would fail; the browser has no way to attach
// the in-memory access token to a normal navigation.
export async function downloadEvidenceFile(evidenceId, fileId, filename) {
  const response = await apiClient.get(`/evidence/${evidenceId}/files/${fileId}/download`, {
    responseType: 'blob',
  });
  const url = window.URL.createObjectURL(response.data);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(url);
}
