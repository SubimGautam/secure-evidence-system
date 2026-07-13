import apiClient from './client';

export function register({ email, password, fullName, captchaToken }) {
  return apiClient
    .post('/auth/register', { email, password, fullName, captchaToken })
    .then((r) => r.data);
}

export function login({ email, password, captchaToken }) {
  return apiClient.post('/auth/login', { email, password, captchaToken }).then((r) => r.data);
}

export function loginMfa({ mfaToken, code, recoveryCode }) {
  return apiClient.post('/auth/login/mfa', { mfaToken, code, recoveryCode }).then((r) => r.data);
}

export function refresh() {
  return apiClient.post('/auth/refresh').then((r) => r.data);
}

export function logout() {
  return apiClient.post('/auth/logout').then((r) => r.data);
}
