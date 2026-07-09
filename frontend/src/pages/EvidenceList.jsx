import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { listEvidence } from '../api/evidence';
import { useAuth } from '../context/AuthContext';
import { getErrorMessage } from '../api/errorMessage';
import Alert from '../components/Alert';
import Spinner from '../components/Spinner';
import EmptyState from '../components/EmptyState';
import StatusBadge from '../components/StatusBadge';

const STATUSES = ['PENDING', 'COLLECTED', 'IN_CUSTODY', 'RELEASED_FOR_COURT', 'RETURNED', 'ARCHIVED'];

function EvidenceList() {
  const { user } = useAuth();
  const [evidence, setEvidence] = useState(null);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  useEffect(() => {
    listEvidence()
      .then(setEvidence)
      .catch((err) => setError(getErrorMessage(err)));
  }, []);

  const filtered = useMemo(() => {
    if (!evidence) return [];
    const q = search.trim().toLowerCase();
    return evidence.filter((item) => {
      const matchesSearch =
        !q ||
        item.referenceCode.toLowerCase().includes(q) ||
        item.description.toLowerCase().includes(q) ||
        item.currentCustodian.fullName.toLowerCase().includes(q);
      const matchesStatus = !statusFilter || item.status === statusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [evidence, search, statusFilter]);

  const canCreate = user.role === 'ADMIN' || user.role === 'OFFICER';

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">Evidence</h1>
        {canCreate && (
          <Link
            to="/evidence/new"
            className="rounded bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-800 dark:bg-slate-100 dark:text-slate-900"
          >
            Log new evidence
          </Link>
        )}
      </div>

      <Alert>{error}</Alert>

      {evidence === null ? (
        <Spinner label="Loading evidence…" />
      ) : evidence.length === 0 ? (
        <EmptyState
          title="No evidence has been logged yet"
          hint={canCreate ? 'Use "Log new evidence" to get started.' : undefined}
        />
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="search"
              placeholder="Search by reference, description, or custodian…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full max-w-xs rounded border border-slate-300 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
            />
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="rounded border border-slate-300 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
            >
              <option value="">All statuses</option>
              {STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s.replace(/_/g, ' ')}
                </option>
              ))}
            </select>
          </div>

          {filtered.length === 0 ? (
            <EmptyState title="No evidence matches your search" />
          ) : (
            <div className="overflow-x-auto rounded border border-slate-200 dark:border-slate-700">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-100 text-xs uppercase tracking-wide text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                  <tr>
                    <th className="px-4 py-2">Reference</th>
                    <th className="px-4 py-2">Description</th>
                    <th className="px-4 py-2">Type</th>
                    <th className="px-4 py-2">Current custodian</th>
                    <th className="px-4 py-2">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 bg-white dark:divide-slate-700 dark:bg-slate-800">
                  {filtered.map((item) => (
                    <tr key={item.id} className="hover:bg-slate-50 dark:hover:bg-slate-700/50">
                      <td className="px-4 py-2">
                        <Link
                          to={`/evidence/${item.id}`}
                          className="font-mono text-xs text-slate-800 hover:underline dark:text-slate-100"
                        >
                          {item.referenceCode}
                        </Link>
                      </td>
                      <td className="px-4 py-2 text-slate-700 dark:text-slate-300">{item.description}</td>
                      <td className="px-4 py-2 text-slate-500 dark:text-slate-400">{item.type}</td>
                      <td className="px-4 py-2 text-slate-500 dark:text-slate-400">
                        {item.currentCustodian.fullName}
                      </td>
                      <td className="px-4 py-2">
                        <StatusBadge status={item.status} />
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

export default EvidenceList;
