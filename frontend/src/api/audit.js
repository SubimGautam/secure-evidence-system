import apiClient from './client';

export function listAuditLog(params = {}) {
  return apiClient.get('/audit-log', { params }).then((r) => r.data);
}

export function verifyAuditChain() {
  return apiClient.get('/audit-log/verify').then((r) => r.data);
}

export function listCustodyTransfers() {
  return apiClient.get('/custody-transfers').then((r) => r.data.transfers);
}
