import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import * as authApi from '../api/auth';
import { setAccessToken, setSessionExpiredHandler } from '../api/client';

const AuthContext = createContext(null);

// 'loading' covers the one moment on first paint where we don't yet know if
// the HttpOnly refresh cookie is still good — rendering routes before that
// resolves would flash the login page for users who are actually signed in.
function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [status, setStatus] = useState('loading');

  const clearSession = useCallback(() => {
    setAccessToken(null);
    setUser(null);
    setStatus('unauthenticated');
  }, []);

  useEffect(() => {
    setSessionExpiredHandler(clearSession);
  }, [clearSession]);

  // The access token only ever lives in memory, so a full page reload loses
  // it — this silently trades the still-valid HttpOnly refresh cookie for a
  // new one on every app boot, so a reload doesn't force a re-login.
  useEffect(() => {
    authApi
      .refresh()
      .then((data) => {
        setAccessToken(data.accessToken);
        setUser(data.user);
        setStatus('authenticated');
      })
      .catch(() => {
        setStatus('unauthenticated');
      });
  }, []);

  async function login(credentials) {
    const result = await authApi.login(credentials);
    if (result.mfaRequired) {
      return result; // caller (Login page) shows the code-entry step
    }
    setAccessToken(result.accessToken);
    setUser(result.user);
    setStatus('authenticated');
    return result;
  }

  async function completeMfaLogin(payload) {
    const result = await authApi.loginMfa(payload);
    setAccessToken(result.accessToken);
    setUser(result.user);
    setStatus('authenticated');
    return result;
  }

  async function register(details) {
    return authApi.register(details);
  }

  async function logout() {
    try {
      await authApi.logout();
    } finally {
      clearSession();
    }
  }

  const value = { user, status, login, completeMfaLogin, register, logout };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
}

export { AuthProvider, useAuth };
