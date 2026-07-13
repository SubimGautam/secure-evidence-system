import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { listCustodyTransfers } from '../api/audit';
import { useAuth } from '../context/AuthContext';
import { getErrorMessage } from '../api/errorMessage';
import Alert from '../components/Alert';
import Spinner from '../components/Spinner';
import EmptyState from '../components/EmptyState';
import StatusBadge from '../components/StatusBadge';

function formatDate(value) {
  return new Date(value).toLocaleString();
}

function CustodyHistory() {
  const { user } = useAuth();
  const canView = user.role === 'AUDITOR' || user.role === 'ADMIN';
  const [transfers, setTransfers] = useState(null);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');

  useEffect(() => {
    if (!canView) return;
    listCustodyTransfers()
      .then(setTransfers)
      .catch((err) => setError(getErrorMessage(err)));
  }, [canView]);

  const filtered = useMemo(() => {
    if (!transfers) return [];
    const q = search.trim().toLowerCase();
    if (!q) return transfers;
    return transfers.filter(
      (t) =>
        t.evidence.referenceCode.toLowerCase().includes(q) ||
        t.evidence.description.toLowerCase().includes(q) ||
        t.fromUser.fullName.toLowerCase().includes(q) ||
        t.toUser.fullName.toLowerCase().includes(q),
    );
  }, [transfers, search]);

  if (!canView) {
    return <Alert>Your role ({user.role}) does not have access to custody history.</Alert>;
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">
          Custody history
        </h1>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Every custody transfer ever initiated, across all evidence.
        </p>
      </div>

      <Alert>{error}</Alert>

      {transfers === null ? (
        <Spinner label="Loading custody history…" />
      ) : (
        <>
          <input
            type="search"
            placeholder="Search by evidence, reference code, or name…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full max-w-sm rounded border border-slate-300 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
          />

          {filtered.length === 0 ? (
            <EmptyState
              title={search ? 'No transfers match your search' : 'No custody transfers yet'}
            />
          ) : (
            <div className="overflow-x-auto rounded border border-slate-200 dark:border-slate-700">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-100 text-xs uppercase tracking-wide text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                  <tr>
                    <th className="px-4 py-2">Evidence</th>
                    <th className="px-4 py-2">From</th>
                    <th className="px-4 py-2">To</th>
                    <th className="px-4 py-2">Initiated</th>
                    <th className="px-4 py-2">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 bg-white dark:divide-slate-700 dark:bg-slate-800">
                  {filtered.map((t) => (
                    <tr key={t.id} className="hover:bg-slate-50 dark:hover:bg-slate-700/50">
                      <td className="px-4 py-2">
                        <Link
                          to={`/evidence/${t.evidence.id}`}
                          className="text-slate-800 hover:underline dark:text-slate-100"
                        >
                          {t.evidence.referenceCode}
                        </Link>
                      </td>
                      <td className="px-4 py-2 text-slate-600 dark:text-slate-300">
                        {t.fromUser.fullName}
                      </td>
                      <td className="px-4 py-2 text-slate-600 dark:text-slate-300">
                        {t.toUser.fullName}
                      </td>
                      <td className="px-4 py-2 text-xs text-slate-400">
                        {formatDate(t.initiatedAt)}
                      </td>
                      <td className="px-4 py-2">
                        <StatusBadge status={t.status} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default CustodyHistory;
