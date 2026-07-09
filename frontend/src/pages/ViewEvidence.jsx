import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  getEvidence,
  updateEvidence,
  downloadEvidenceFile,
  confirmCollection,
  reopenForCorrection,
  releaseForCourt,
  markReturned,
  archiveEvidence,
} from '../api/evidence';
import { initiateTransfer, acceptTransfer, rejectTransfer } from '../api/custody';
import { getDirectory } from '../api/users';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { getErrorMessage } from '../api/errorMessage';
import Alert from '../components/Alert';
import StatusBadge from '../components/StatusBadge';
import Spinner from '../components/Spinner';

// Mirrors the backend's TRANSFERABLE_STATUSES (custody.service.js) — only
// enough to drive which buttons render; the server enforces the real rule.
const TRANSFERABLE_STATUSES = ['COLLECTED', 'IN_CUSTODY', 'RETURNED'];

function formatDate(value) {
  return new Date(value).toLocaleString();
}

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  return `${(bytes / 1024).toFixed(1)} KB`;
}

function ViewEvidence() {
  const { id } = useParams();
  const { user } = useAuth();
  const toast = useToast();

  const [evidence, setEvidence] = useState(null);
  const [directory, setDirectory] = useState([]);
  const [error, setError] = useState('');
  const [actionError, setActionError] = useState('');
  const [busy, setBusy] = useState(false);

  const [editing, setEditing] = useState(false);
  const [description, setDescription] = useState('');
  const [collectedLocation, setCollectedLocation] = useState('');

  const [recipientId, setRecipientId] = useState('');

  const load = useCallback(() => {
    return getEvidence(id)
      .then((data) => {
        setEvidence(data);
        setDescription(data.description);
        setCollectedLocation(data.collectedLocation ?? '');
      })
      .catch((err) => setError(getErrorMessage(err)));
  }, [id]);

  useEffect(() => {
    load();
    getDirectory().then(setDirectory).catch(() => {});
  }, [load]);

  if (error) return <Alert>{error}</Alert>;
  if (!evidence) return <Spinner label="Loading evidence…" />;

  const isAdmin = user.role === 'ADMIN';
  const isLogger = evidence.loggedBy.id === user.id;
  const isCurrentCustodian = evidence.currentCustodian.id === user.id;
  const { status } = evidence;

  const canEdit = isAdmin || (isLogger && ['PENDING', 'COLLECTED'].includes(status));
  const canUpload = isAdmin || isCurrentCustodian;

  // Lifecycle actions — same custodian-or-admin gate as the server's
  // requireCurrentCustodian, narrowed further by which move is legal from
  // the item's current status (matching evidence.service.js transitionStatus).
  const isCustodianOrAdmin = isAdmin || isCurrentCustodian;
  const canConfirm = isCustodianOrAdmin && status === 'PENDING';
  const canRelease = isCustodianOrAdmin && ['IN_CUSTODY', 'RETURNED'].includes(status);
  const canReturn = isCustodianOrAdmin && status === 'RELEASED_FOR_COURT';
  const canArchive = isCustodianOrAdmin && ['COLLECTED', 'IN_CUSTODY', 'RETURNED'].includes(status);

  const pendingTransfer = evidence.custodyTransfers.find((t) => t.status === 'PENDING');
  const canRespond = pendingTransfer && (isAdmin || pendingTransfer.toUser.id === user.id);
  const canInitiateTransfer =
    !pendingTransfer && isCustodianOrAdmin && TRANSFERABLE_STATUSES.includes(status);
  // Undoing a confirmation is the original logging Officer's call, not the
  // current custodian's — mirrors requireEvidenceOwner on the server, plus
  // the same "no pending transfer" guard the service layer enforces.
  const canReopen = (isAdmin || isLogger) && status === 'COLLECTED' && !pendingTransfer;
  const recipientOptions = directory.filter((d) => d.id !== evidence.currentCustodian.id);

  async function handleSaveEdit(e) {
    e.preventDefault();
    setActionError('');
    setBusy(true);
    try {
      await updateEvidence(id, { description, collectedLocation: collectedLocation || undefined });
      setEditing(false);
      await load();
      toast.success('Evidence updated.');
    } catch (err) {
      setActionError(getErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function handleInitiateTransfer(e) {
    e.preventDefault();
    if (!recipientId) return;
    setActionError('');
    setBusy(true);
    try {
      await initiateTransfer(id, recipientId);
      setRecipientId('');
      await load();
      toast.success('Custody transfer initiated.');
    } catch (err) {
      setActionError(getErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function handleRespond(accept) {
    setActionError('');
    setBusy(true);
    try {
      if (accept) await acceptTransfer(pendingTransfer.id);
      else await rejectTransfer(pendingTransfer.id);
      await load();
      toast.success(accept ? 'Custody accepted.' : 'Custody transfer rejected.');
    } catch (err) {
      setActionError(getErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  // Shared by the four lifecycle buttons below — same request/error/reload
  // shape, just a different endpoint and success message each time.
  async function handleLifecycleAction(actionFn, successMessage) {
    setActionError('');
    setBusy(true);
    try {
      await actionFn(id);
      await load();
      toast.success(successMessage);
    } catch (err) {
      setActionError(getErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  const lifecycleActions = [
    canConfirm && {
      key: 'confirm',
      label: 'Confirm collection',
      variant: 'primary',
      onClick: () => handleLifecycleAction(confirmCollection, 'Collection confirmed.'),
    },
    canReopen && {
      key: 'reopen',
      label: 'Reopen for correction',
      variant: 'secondary',
      onClick: () => handleLifecycleAction(reopenForCorrection, 'Evidence reopened for correction.'),
    },
    canRelease && {
      key: 'release',
      label: 'Release for court',
      variant: 'secondary',
      onClick: () => handleLifecycleAction(releaseForCourt, 'Evidence released for court.'),
    },
    canReturn && {
      key: 'return',
      label: 'Mark returned',
      variant: 'secondary',
      onClick: () => handleLifecycleAction(markReturned, 'Evidence marked returned.'),
    },
    canArchive && {
      key: 'archive',
      label: 'Archive',
      variant: 'danger',
      onClick: () => handleLifecycleAction(archiveEvidence, 'Evidence archived.'),
    },
  ].filter(Boolean);

  const actionButtonClass = {
    primary:
      'bg-slate-900 text-white hover:bg-slate-800 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white',
    secondary:
      'border border-slate-300 text-slate-600 hover:bg-slate-100 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-700',
    danger:
      'border border-red-300 text-red-600 hover:bg-red-50 dark:border-red-900 dark:text-red-400 dark:hover:bg-red-950',
  };

  return (
    <div className="flex flex-col gap-8">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="font-mono text-xs text-slate-400">{evidence.referenceCode}</p>
          <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">
            {evidence.description}
          </h1>
        </div>
        <div className="flex flex-col items-end gap-2">
          <StatusBadge status={status} />
          {lifecycleActions.length > 0 && (
            <div className="flex flex-wrap justify-end gap-1.5">
              {lifecycleActions.map((action) => (
                <button
                  key={action.key}
                  type="button"
                  disabled={busy}
                  onClick={action.onClick}
                  className={`rounded px-2.5 py-1 text-xs font-medium disabled:opacity-50 ${actionButtonClass[action.variant]}`}
                >
                  {action.label}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      <Alert>{actionError}</Alert>

      {/* Details */}
      <section className="rounded border border-slate-200 bg-white p-5 dark:border-slate-700 dark:bg-slate-800">
        {!editing ? (
          <>
            <dl className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <dt className="text-slate-400">Type</dt>
                <dd className="text-slate-800 dark:text-slate-200">{evidence.type}</dd>
              </div>
              <div>
                <dt className="text-slate-400">Collected at</dt>
                <dd className="text-slate-800 dark:text-slate-200">{formatDate(evidence.collectedAt)}</dd>
              </div>
              <div>
                <dt className="text-slate-400">Collected location</dt>
                <dd className="text-slate-800 dark:text-slate-200">
                  {evidence.collectedLocation || '—'}
                </dd>
              </div>
              <div>
                <dt className="text-slate-400">Logged by</dt>
                <dd className="text-slate-800 dark:text-slate-200">{evidence.loggedBy.fullName}</dd>
              </div>
              <div>
                <dt className="text-slate-400">Current custodian</dt>
                <dd className="text-slate-800 dark:text-slate-200">
                  {evidence.currentCustodian.fullName}
                </dd>
              </div>
            </dl>
            {canEdit && (
              <button
                type="button"
                onClick={() => setEditing(true)}
                className="mt-4 rounded border border-slate-300 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-100 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-700"
              >
                Edit
              </button>
            )}
          </>
        ) : (
          <form onSubmit={handleSaveEdit} className="flex flex-col gap-3">
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium text-slate-700 dark:text-slate-300">Description</span>
              <textarea
                required
                rows={3}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="rounded border border-slate-300 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
              />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium text-slate-700 dark:text-slate-300">Collected location</span>
              <input
                type="text"
                value={collectedLocation}
                onChange={(e) => setCollectedLocation(e.target.value)}
                className="rounded border border-slate-300 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
              />
            </label>
            <div className="flex gap-2">
              <button
                type="submit"
                disabled={busy}
                className="rounded bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50 dark:bg-slate-100 dark:text-slate-900"
              >
                Save
              </button>
              <button
                type="button"
                onClick={() => setEditing(false)}
                className="rounded border border-slate-300 px-3 py-1.5 text-sm text-slate-600 dark:border-slate-600 dark:text-slate-300"
              >
                Cancel
              </button>
            </div>
          </form>
        )}
      </section>

      {/* Custody */}
      <section className="rounded border border-slate-200 bg-white p-5 dark:border-slate-700 dark:bg-slate-800">
        <h2 className="mb-3 text-sm font-semibold text-slate-700 dark:text-slate-300">Chain of custody</h2>

        {canRespond && (
          <div className="mb-4 rounded border border-amber-200 bg-amber-50 p-3 dark:border-amber-900 dark:bg-amber-950">
            <p className="text-sm text-amber-800 dark:text-amber-300">
              {pendingTransfer.fromUser.fullName} wants to transfer this item to you.
            </p>
            <div className="mt-2 flex gap-2">
              <button
                type="button"
                disabled={busy}
                onClick={() => handleRespond(true)}
                className="rounded bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
              >
                Accept
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => handleRespond(false)}
                className="rounded border border-slate-300 px-3 py-1.5 text-sm text-slate-600 dark:border-slate-600 dark:text-slate-300"
              >
                Reject
              </button>
            </div>
          </div>
        )}

        {pendingTransfer && !canRespond && (
          <p className="mb-4 text-sm text-slate-500 dark:text-slate-400">
            Awaiting response from {pendingTransfer.toUser.fullName}.
          </p>
        )}

        {status === 'PENDING' && !pendingTransfer && (
          <p className="mb-4 text-sm text-slate-500 dark:text-slate-400">
            Collection must be confirmed before this item can be transferred.
          </p>
        )}

        {canInitiateTransfer && (
          <form onSubmit={handleInitiateTransfer} className="mb-4 flex items-end gap-2">
            <label className="flex flex-1 flex-col gap-1 text-sm">
              <span className="font-medium text-slate-700 dark:text-slate-300">Transfer custody to</span>
              <select
                required
                value={recipientId}
                onChange={(e) => setRecipientId(e.target.value)}
                className="rounded border border-slate-300 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
              >
                <option value="" disabled>
                  Select a recipient…
                </option>
                {recipientOptions.map((person) => (
                  <option key={person.id} value={person.id}>
                    {person.fullName} ({person.role.name})
                  </option>
                ))}
              </select>
            </label>
            <button
              type="submit"
              disabled={busy}
              className="rounded bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50 dark:bg-slate-100 dark:text-slate-900"
            >
              Initiate transfer
            </button>
          </form>
        )}

        {evidence.custodyTransfers.length === 0 ? (
          <p className="text-sm text-slate-500 dark:text-slate-400">No transfers yet.</p>
        ) : (
          <ul className="divide-y divide-slate-200 text-sm dark:divide-slate-700">
            {evidence.custodyTransfers.map((t) => (
              <li key={t.id} className="flex items-center justify-between py-2">
                <span className="text-slate-600 dark:text-slate-300">
                  {t.fromUser.fullName} → {t.toUser.fullName}
                </span>
                <span className="flex items-center gap-2">
                  <span className="text-xs text-slate-400">{formatDate(t.initiatedAt)}</span>
                  <StatusBadge status={t.status} />
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Files */}
      <section className="rounded border border-slate-200 bg-white p-5 dark:border-slate-700 dark:bg-slate-800">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-300">
            Files ({evidence.files.length})
          </h2>
          {canUpload && (
            <Link
              to={`/evidence/${id}/upload`}
              className="rounded border border-slate-300 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-100 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-700"
            >
              Upload file
            </Link>
          )}
        </div>
        {evidence.files.length === 0 ? (
          <p className="text-sm text-slate-500 dark:text-slate-400">No files attached.</p>
        ) : (
          <ul className="divide-y divide-slate-200 text-sm dark:divide-slate-700">
            {evidence.files.map((file) => (
              <li key={file.id} className="flex items-center justify-between py-2">
                <div>
                  <p className="text-slate-800 dark:text-slate-200">{file.originalFilename}</p>
                  <p className="text-xs text-slate-400">
                    {formatBytes(file.sizeBytes)} · uploaded by {file.uploadedBy.fullName} ·{' '}
                    {formatDate(file.createdAt)}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() =>
                    downloadEvidenceFile(id, file.id, file.originalFilename).catch((err) =>
                      toast.error(getErrorMessage(err)),
                    )
                  }
                  className="rounded border border-slate-300 px-3 py-1 text-xs text-slate-600 hover:bg-slate-100 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-700"
                >
                  Download
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

export default ViewEvidence;
