import { useState } from 'react';
import QRCode from 'qrcode';
import * as authApi from '../api/auth';
import { getErrorMessage } from '../api/errorMessage';
import Alert from './Alert';


function MfaSettings({ profile, isAdmin, onChanged }) {
  const [mode, setMode] = useState('idle'); 
  const [secret, setSecret] = useState('');
  const [qrDataUrl, setQrDataUrl] = useState('');
  const [code, setCode] = useState('');
  const [recoveryCodes, setRecoveryCodes] = useState([]);
  const [password, setPassword] = useState('');
  const [disableCode, setDisableCode] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function startSetup() {
    setError('');
    setBusy(true);
    try {
      const result = await authApi.setupMfa();
      setSecret(result.secret);

      setQrDataUrl(await QRCode.toDataURL(result.otpauthUrl));
      setMode('setting-up');
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function confirmSetup(e) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      const result = await authApi.verifyMfaSetup(code);
      setRecoveryCodes(result.recoveryCodes);
      setMode('recovery-codes');
      setCode('');
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  function finishEnrollment() {
    setMode('idle');
    setSecret('');
    setQrDataUrl('');
    setRecoveryCodes([]);
    onChanged();
  }

  async function confirmDisable(e) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      await authApi.disableMfa({ password, code: disableCode });
      setMode('idle');
      setPassword('');
      setDisableCode('');
      onChanged();
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="flex flex-col gap-3 rounded border border-slate-200 bg-white p-5 dark:border-slate-700 dark:bg-slate-800">
      <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-300">
        Multi-Factor Authentication
      </h2>

      <Alert>{error}</Alert>

      {mode === 'idle' && profile.mfaEnabled && (
        <div className="flex flex-col gap-2">
          <p className="text-xs text-slate-500 dark:text-slate-400">
            MFA is enabled on this account. A 6-digit code from your authenticator app is required
            on every login.
          </p>
          {isAdmin ? (
            <p className="text-xs text-slate-400">
              MFA is mandatory for the Admin role and cannot be disabled.
            </p>
          ) : (
            <button
              type="button"
              onClick={() => setMode('disabling')}
              className="self-start rounded border border-slate-300 px-3 py-2 text-sm text-slate-700 hover:bg-slate-100 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-700"
            >
              Disable MFA
            </button>
          )}
        </div>
      )}
      

      {mode === 'idle' && !profile.mfaEnabled && (
        <div className="flex flex-col gap-2">
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Not enabled. Add a second factor so a leaked password alone isn&apos;t enough to sign
            in.
          </p>
          <button
            type="button"
            onClick={startSetup}
            disabled={busy}
            className="self-start rounded bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50 dark:bg-slate-100 dark:text-slate-900"
          >
            {busy ? 'Starting…' : 'Enable MFA'}
          </button>
        </div>
      )}

      {mode === 'setting-up' && (
        <form onSubmit={confirmSetup} className="flex flex-col gap-3">
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Scan this QR code with an authenticator app (Google Authenticator, Authy, etc.), or
            enter the key manually.
          </p>
          {qrDataUrl && (
            <img src={qrDataUrl} alt="TOTP QR code" className="h-40 w-40 self-center" />
          )}
          <div className="self-center rounded bg-slate-100 px-3 py-2 text-center font-mono text-sm tracking-wider dark:bg-slate-900 dark:text-slate-100">
            {secret}
          </div>
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-slate-700 dark:text-slate-300">
              Enter the 6-digit code from your app
            </span>
            <input
              type="text"
              inputMode="numeric"
              pattern="\d{6}"
              maxLength={6}
              required
              autoFocus
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
              className="rounded border border-slate-300 px-3 py-2 text-center text-lg tracking-[0.5em] dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
            />
          </label>
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={busy || code.length !== 6}
              className="rounded bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50 dark:bg-slate-100 dark:text-slate-900"
            >
              {busy ? 'Verifying…' : 'Verify & enable'}
            </button>
            <button
              type="button"
              onClick={() => setMode('idle')}
              className="rounded border border-slate-300 px-3 py-2 text-sm text-slate-700 dark:border-slate-600 dark:text-slate-200"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {mode === 'recovery-codes' && (
        <div className="flex flex-col gap-3">
          <p className="text-xs text-amber-700 dark:text-amber-400">
            Save these recovery codes now — each is single-use, and this is the only time
            they&apos;re shown. Use one if you ever lose access to your authenticator app.
          </p>
          <ul className="grid grid-cols-2 gap-2 rounded bg-slate-100 p-3 font-mono text-sm dark:bg-slate-900 dark:text-slate-100">
            {recoveryCodes.map((c) => (
              <li key={c}>{c}</li>
            ))}
          </ul>
          <button
            type="button"
            onClick={finishEnrollment}
            className="self-start rounded bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-800 dark:bg-slate-100 dark:text-slate-900"
          >
            I&apos;ve saved these — done
          </button>
        </div>
      )}

      {mode === 'disabling' && (
        <form onSubmit={confirmDisable} className="flex flex-col gap-3">
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-slate-700 dark:text-slate-300">Password</span>
            <input
              type="password"
              required
              autoFocus
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="rounded border border-slate-300 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-slate-700 dark:text-slate-300">
              Current 6-digit code
            </span>
            <input
              type="text"
              inputMode="numeric"
              pattern="\d{6}"
              maxLength={6}
              required
              value={disableCode}
              onChange={(e) => setDisableCode(e.target.value.replace(/\D/g, ''))}
              className="rounded border border-slate-300 px-3 py-2 text-center text-lg tracking-[0.5em] dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
            />
          </label>
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={busy || disableCode.length !== 6}
              className="rounded bg-red-600 px-3 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
            >
              {busy ? 'Disabling…' : 'Confirm disable'}
            </button>
            <button
              type="button"
              onClick={() => setMode('idle')}
              className="rounded border border-slate-300 px-3 py-2 text-sm text-slate-700 dark:border-slate-600 dark:text-slate-200"
            >
              Cancel
            </button>
          </div>
        </form>
      )}
    </section>
  );
}

export default MfaSettings;
