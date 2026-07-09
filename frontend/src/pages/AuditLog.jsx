import { Fragment, useEffect, useState } from 'react';
import { listAuditLog } from '../api/audit';
import { useAuth } from '../context/AuthContext';
import { getErrorMessage } from '../api/errorMessage';
import Alert from '../components/Alert';
import Spinner from '../components/Spinner';
import EmptyState from '../components/EmptyState';

const PAGE_SIZE = 25;

function formatDate(value) {
  return new Date(value).toLocaleString();
}

function AuditLog() {
  const { user } = useAuth();
  const canView = user.role === 'AUDITOR' || user.role === 'ADMIN';
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [offset, setOffset] = useState(0);
  const [eventType, setEventType] = useState('');
  const [expandedId, setExpandedId] = useState(null);

  useEffect(() => {
    if (!canView) return;
    const params = { limit: PAGE_SIZE, offset };
    if (eventType) params.eventType = eventType;
    // Deliberately doesn't reset `data` to null before the request resolves —
    // the previous page/filter's rows stay on screen (no flash to a full-page
    // spinner) until the new ones are ready to replace them.
    listAuditLog(params)
      .then(setData)
      .catch((err) => setError(getErrorMessage(err)));
  }, [canView, offset, eventType]);

  if (!canView) {
    return <Alert>Your role ({user.role}) does not have access to the audit log.</Alert>;
  }

  const eventTypes = [
    'USER_REGISTERED',
    'LOGIN_SUCCESS',
    'LOGOUT',
    'TOKEN_REUSE_DETECTED',
    'MFA_ENABLED',
    'MFA_DISABLED',
    'MFA_RESET_BY_ADMIN',
    'PASSWORD_RESET_COMPLETED',
    'SESSION_REVOKED',
    'EVIDENCE_CREATED',
    'EVIDENCE_UPDATED',
    'EVIDENCE_FILE_UPLOADED',
    'EVIDENCE_FILE_DOWNLOADED',
    'CUSTODY_TRANSFER_INITIATED',
    'CUSTODY_TRANSFER_ACCEPTED',
    'CUSTODY_TRANSFER_REJECTED',
    'USER_ROLE_CHANGED',
    'USER_STATUS_CHANGED',
    'USER_LOCKED',
    'USER_UNLOCKED',
  ];

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">Audit log</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Every security-relevant action, in a tamper-evident hash chain. Read-only.
        </p>
      </div>

      <Alert>{error}</Alert>

      <div className="flex items-center gap-2">
        <select
          value={eventType}
          onChange={(e) => {
            setEventType(e.target.value);
            setOffset(0);
          }}
          className="rounded border border-slate-300 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
        >
          <option value="">All event types</option>
          {eventTypes.map((et) => (
            <option key={et} value={et}>
              {et}
            </option>
          ))}
        </select>
        {data && <span className="text-xs text-slate-400">{data.total} total entries</span>}
      </div>

      {data === null ? (
        <Spinner label="Loading audit log…" />
      ) : data.logs.length === 0 ? (
        <EmptyState title="No matching audit entries" />
      ) : (
        <>
          <div className="overflow-x-auto rounded border border-slate-200 dark:border-slate-700">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-100 text-xs uppercase tracking-wide text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                <tr>
                  <th className="px-4 py-2">Timestamp</th>
                  <th className="px-4 py-2">Actor</th>
                  <th className="px-4 py-2">Event</th>
                  <th className="px-4 py-2">Target</th>
                  <th className="px-4 py-2" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 bg-white dark:divide-slate-700 dark:bg-slate-800">
                {data.logs.map((log) => (
                  <Fragment key={log.id}>
                    <tr className="hover:bg-slate-50 dark:hover:bg-slate-700/50">
                      <td className="whitespace-nowrap px-4 py-2 font-mono text-xs text-slate-500 dark:text-slate-400">
                        {formatDate(log.timestamp)}
                      </td>
                      <td className="px-4 py-2 text-slate-700 dark:text-slate-300">
                        {log.actorUser?.fullName ?? <span className="text-slate-400">system</span>}
                      </td>
                      <td className="px-4 py-2">
                        <span className="rounded bg-slate-100 px-2 py-0.5 font-mono text-xs text-slate-700 dark:bg-slate-700 dark:text-slate-200">
                          {log.eventType}
                        </span>
                      </td>
                      <td className="px-4 py-2 text-xs text-slate-500 dark:text-slate-400">
                        {log.entityType ? `${log.entityType}:${log.entityId?.slice(0, 8)}…` : '—'}
                      </td>
                      <td className="px-4 py-2 text-right">
                        {log.payload && (
                          <button
                            type="button"
                            onClick={() => setExpandedId(expandedId === log.id ? null : log.id)}
                            className="text-xs text-slate-500 underline dark:text-slate-400"
                          >
                            {expandedId === log.id ? 'Hide' : 'Details'}
                          </button>
                        )}
                      </td>
                    </tr>
                    {expandedId === log.id && (
                      <tr>
                        <td colSpan={5} className="bg-slate-50 px-4 py-2 dark:bg-slate-900">
                          <pre className="overflow-x-auto text-xs text-slate-600 dark:text-slate-300">
                            {JSON.stringify(log.payload, null, 2)}
                          </pre>
                          <p className="mt-1 font-mono text-[10px] text-slate-400">
                            hash: {log.entryHash}
                          </p>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex items-center justify-between text-sm">
            <button
              type="button"
              disabled={offset === 0}
              onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
              className="rounded border border-slate-300 px-3 py-1.5 text-slate-600 disabled:opacity-40 dark:border-slate-600 dark:text-slate-300"
            >
              Previous
            </button>
            <span className="text-slate-400">
              {offset + 1}–{Math.min(offset + PAGE_SIZE, data.total)} of {data.total}
            </span>
            <button
              type="button"
              disabled={offset + PAGE_SIZE >= data.total}
              onClick={() => setOffset(offset + PAGE_SIZE)}
              className="rounded border border-slate-300 px-3 py-1.5 text-slate-600 disabled:opacity-40 dark:border-slate-600 dark:text-slate-300"
            >
              Next
            </button>
          </div>
        </>
      )}
    </div>
  );
}

export default AuditLog;
