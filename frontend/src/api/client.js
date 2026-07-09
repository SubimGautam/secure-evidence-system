import axios from 'axios';

// A relative baseURL works in both environments without an env var: the Vite
// dev server proxies /api to the backend (see vite.config.js), and in Docker
// the nginx edge does the same proxying in front of the production build.
//
// withCredentials is required from the start: the refresh token cookie is
// HttpOnly and SameSite=Strict, so Axios must be told to send/receive
// cookies on every request or the auth flow silently breaks.
const apiClient = axios.create({
  baseURL: '/api/v1',
  withCredentials: true,
  timeout: 10_000,
});

// The access token lives here, in memory, never in localStorage — an XSS
// bug can only steal it for as long as the tab is open, not indefinitely
// (architecture doc §4/§11). AuthContext is the only thing that calls
// setAccessToken; every other module just makes API calls and lets the
// interceptor below attach whatever token is current.
let accessToken = null;
export function setAccessToken(token) {
  accessToken = token;
}

// Called once, by AuthContext, so it can react when a refresh attempt
// ultimately fails (session truly gone) by clearing user state and
// redirecting to /login — the interceptor itself has no router access.
let onSessionExpired = null;
export function setSessionExpiredHandler(fn) {
  onSessionExpired = fn;
}

apiClient.interceptors.request.use((config) => {
  if (accessToken) {
    config.headers.Authorization = `Bearer ${accessToken}`;
  }
  return config;
});

// Endpoints where a 401 means something other than "your access token
// expired mid-session" — retrying them after a silent refresh would either
// be meaningless (refresh itself failing) or mask the real error (wrong
// password on login). Every other authenticated call is fair game for the
// retry-after-refresh flow below.
const SKIP_REFRESH_RETRY = new Set([
  '/auth/login',
  '/auth/login/mfa',
  '/auth/register',
  '/auth/refresh',
  '/auth/logout',
  '/auth/password-reset/request',
  '/auth/password-reset/confirm',
]);

// Concurrent requests that all 401 at once (e.g. a page firing several
// queries on mount) must not each trigger their own refresh call — they
// share one in-flight refresh and all retry once it resolves.
let refreshPromise = null;

apiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    const { config, response } = error;

    if (response?.status !== 401 || config._retry || SKIP_REFRESH_RETRY.has(config.url)) {
      return Promise.reject(error);
    }
    config._retry = true;

    try {
      if (!refreshPromise) {
        refreshPromise = apiClient.post('/auth/refresh').finally(() => {
          refreshPromise = null;
        });
      }
      const { data } = await refreshPromise;
      setAccessToken(data.accessToken);
      config.headers.Authorization = `Bearer ${data.accessToken}`;
      return apiClient(config);
    } catch (refreshError) {
      setAccessToken(null);
      onSessionExpired?.();
      return Promise.reject(refreshError);
    }
  },
);

export default apiClient;
