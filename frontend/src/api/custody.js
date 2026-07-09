import apiClient from './client';

export function initiateTransfer(evidenceId, toUserId) {
  return apiClient.post(`/evidence/${evidenceId}/transfer`, { toUserId }).then((r) => r.data.transfer);
}

export function acceptTransfer(transferId) {
  return apiClient.post(`/transfers/${transferId}/accept`).then((r) => r.data.transfer);
}

export function rejectTransfer(transferId) {
  return apiClient.post(`/transfers/${transferId}/reject`).then((r) => r.data.transfer);
}

export function listIncomingTransfers() {
  return apiClient.get('/transfers/incoming').then((r) => r.data.transfers);
}
