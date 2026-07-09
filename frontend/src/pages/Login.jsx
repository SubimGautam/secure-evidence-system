import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { getErrorMessage } from '../api/errorMessage';
import Alert from '../components/Alert';

function Login() {
  const { login, completeMfaLogin } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const redirectTo = location.state?.from?.pathname ?? '/dashboard';

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [mfaToken, setMfaToken] = useState(null);
  const [code, setCode] = useState('');
  const [useRecoveryCode, setUseRecoveryCode] = useState(false);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function handlePasswordSubmit(e) {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      const result = await login({ email, password });
      if (result.mfaRequired) {
        setMfaToken(result.mfaToken);
      } else {
        navigate(redirectTo, { replace: true });
      }
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleMfaSubmit(e) {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      await completeMfaLogin(
        useRecoveryCode ? { mfaToken, recoveryCode: code } : { mfaToken, code },
      );
      navigate(redirectTo, { replace: true });
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-6 px-6">
      <div>
        <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">
          Evidence Chain-of-Custody
        </h1>
        <p className="text-sm text-slate-500 dark:text-slate-400">Sign in to continue</p>
      </div>

      <Alert>{error}</Alert>

      {!mfaToken ? (
        <form onSubmit={handlePasswordSubmit} className="flex flex-col gap-4">
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-slate-700 dark:text-slate-300">Email</span>
            <input
              type="email"
              required
              autoComplete="username"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="rounded border border-slate-300 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-slate-700 dark:text-slate-300">Password</span>
            <input
              type="password"
              required
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="rounded border border-slate-300 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
            />
          </label>
          <button
            type="submit"
            disabled={submitting}
            className="rounded bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white"
          >
            {submitting ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
      ) : (
        <form onSubmit={handleMfaSubmit} className="flex flex-col gap-4">
          <p className="text-sm text-slate-600 dark:text-slate-400">
            {useRecoveryCode
              ? 'Enter one of your unused recovery codes.'
              : 'Enter the 6-digit code from your authenticator app.'}
          </p>
          <input
            type="text"
            required
            autoFocus
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder={useRecoveryCode ? 'XXXXX-XXXXX' : '123456'}
            className="rounded border border-slate-300 px-3 py-2 text-center text-lg tracking-widest dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
          />
          <button
            type="submit"
            disabled={submitting}
            className="rounded bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white"
          >
            {submitting ? 'Verifying…' : 'Verify'}
          </button>
          <button
            type="button"
            onClick={() => {
              setUseRecoveryCode((v) => !v);
              setCode('');
              setError('');
            }}
            className="text-xs text-slate-500 underline dark:text-slate-400"
          >
            {useRecoveryCode ? 'Use an authenticator code instead' : 'Use a recovery code instead'}
          </button>
        </form>
      )}

      <p className="text-center text-sm text-slate-500 dark:text-slate-400">
        No account?{' '}
        <Link to="/register" className="underline">
          Register
        </Link>
      </p>
    </main>
  );
}

export default Login;
