import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { listEvidence } from '../api/evidence';
import { listIncomingTransfers } from '../api/custody';
import { useAuth } from '../context/AuthContext';
import { getErrorMessage } from '../api/errorMessage';
import Alert from '../components/Alert';
import Spinner from '../components/Spinner';
import EmptyState from '../components/EmptyState';
import StatusBadge from '../components/StatusBadge';

const STATUS_ORDER = [
  'PENDING',
  'COLLECTED',
  'IN_CUSTODY',
  'RELEASED_FOR_COURT',
  'RETURNED',
  'ARCHIVED',
];

function Dashboard() {
  const { user } = useAuth();
  const [evidence, setEvidence] = useState(null);
  const [incomingTransfers, setIncomingTransfers] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    listEvidence()
      .then(setEvidence)
      .catch((err) => setError(getErrorMessage(err)));
    listIncomingTransfers()
      .then(setIncomingTransfers)
      .catch((err) => setError(getErrorMessage(err)));
  }, []);

  const canCreate = user.role === 'ADMIN' || user.role === 'OFFICER';
  const myCustody = evidence?.filter((e) => e.currentCustodian.id === user.id) ?? [];
  const counts = STATUS_ORDER.map((status) => ({
    status,
    count: evidence?.filter((e) => e.status === status).length ?? 0,
  }));

  return (
    <div className="flex flex-col gap-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">
            Welcome, {user.fullName}
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">{user.role}</p>
        </div>
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

      <section className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {counts.map(({ status, count }) => (
          <div
            key={status}
            className="rounded border border-slate-200 bg-white p-4 text-center dark:border-slate-700 dark:bg-slate-800"
          >
            <div className="text-2xl font-semibold text-slate-900 dark:text-slate-100">{count}</div>
            <div className="mt-1">
              <StatusBadge status={status} />
            </div>
          </div>
        ))}
      </section>

      {incomingTransfers && incomingTransfers.length > 0 && (
        <section className="rounded border border-amber-200 bg-amber-50 p-4 dark:border-amber-900 dark:bg-amber-950">
          <h2 className="mb-3 text-sm font-semibold text-amber-800 dark:text-amber-300">
            Incoming transfers awaiting your response ({incomingTransfers.length})
          </h2>
          <ul className="divide-y divide-amber-200 dark:divide-amber-900">
            {incomingTransfers.map((t) => (
              <li key={t.id} className="flex items-center justify-between py-2 text-sm">
                <Link
                  to={`/evidence/${t.evidence.id}`}
                  className="font-medium text-amber-900 hover:underline dark:text-amber-200"
                >
                  {t.evidence.referenceCode} — {t.evidence.description}
                </Link>
                <span className="text-amber-700 dark:text-amber-400">
                  from {t.fromUser.fullName}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-300">
            Currently in your custody ({myCustody.length})
          </h2>
          <Link to="/evidence" className="text-sm text-slate-500 underline dark:text-slate-400">
            View all evidence
          </Link>
        </div>
        {evidence === null ? (
          <Spinner label="Loading your custody…" />
        ) : myCustody.length === 0 ? (
          <EmptyState title="Nothing in your custody right now" />
        ) : (
          <ul className="divide-y divide-slate-200 rounded border border-slate-200 bg-white dark:divide-slate-700 dark:border-slate-700 dark:bg-slate-800">
            {myCustody.slice(0, 5).map((item) => (
              <li key={item.id} className="flex items-center justify-between px-4 py-3 text-sm">
                <Link
                  to={`/evidence/${item.id}`}
                  className="font-medium text-slate-800 hover:underline dark:text-slate-100"
                >
                  {item.referenceCode} — {item.description}
                </Link>
                <StatusBadge status={item.status} />
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

export default Dashboard;
