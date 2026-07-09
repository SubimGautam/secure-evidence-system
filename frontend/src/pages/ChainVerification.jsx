import { useState } from 'react';
import { verifyAuditChain } from '../api/audit';
import { useAuth } from '../context/AuthContext';
import { getErrorMessage } from '../api/errorMessage';
import Alert from '../components/Alert';
import Spinner from '../components/Spinner';

function formatDate(value) {
  return new Date(value).toLocaleString();
}

function ChainVerification() {
  const { user } = useAuth();
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [checking, setChecking] = useState(false);

  if (user.role !== 'AUDITOR' && user.role !== 'ADMIN') {
    return <Alert>Your role ({user.role}) does not have access to chain verification.</Alert>;
  }

  async function runVerification() {
    setError('');
    setChecking(true);
    setResult(null); 
    try {
      const data = await verifyAuditChain();
      setResult(data);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setChecking(false);
    }
  }

  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">
          Chain integrity verification
        </h1>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Recomputes every entry's hash from its stored contents and confirms each one links to
          the entry before it. A single altered field, anywhere in the history, breaks the chain
          from that point forward.
        </p>
      </div>

      <button
        type="button"
        onClick={runVerification}
        disabled={checking}
        className="w-fit rounded bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50 dark:bg-slate-100 dark:text-slate-900"
      >
        {checking ? 'Verifying…' : 'Verify chain integrity'}
      </button>

      {checking && <Spinner label="Recomputing hashes…" />}

      <Alert>{error}</Alert>

      {result && (
        <div
          className={`rounded border p-5 ${
            result.valid
              ? 'border-emerald-200 bg-emerald-50 dark:border-emerald-900 dark:bg-emerald-950'
              : 'border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950'
          }`}
        >
          <p
            className={`text-lg font-semibold ${
              result.valid
                ? 'text-emerald-800 dark:text-emerald-300'
                : 'text-red-800 dark:text-red-300'
            }`}
          >
            {result.valid ? 'Chain is intact' : 'Chain integrity FAILED'}
          </p>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
            Checked {result.checkedCount} of {result.totalCount} entries.
          </p>
          {!result.valid && result.brokenAt && (
            <div className="mt-3 rounded bg-white/60 p-3 text-sm dark:bg-black/20">
              <p className="text-red-700 dark:text-red-300">{result.reason}</p>
              <p className="mt-2 font-mono text-xs text-slate-500 dark:text-slate-400">
                Entry: {result.brokenAt.eventType} · {formatDate(result.brokenAt.timestamp)}
              </p>
              <p className="font-mono text-xs text-slate-500 dark:text-slate-400">
                ID: {result.brokenAt.id}
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default ChainVerification;
