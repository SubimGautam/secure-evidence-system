import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { createEvidence, confirmCollection } from '../api/evidence';
import { initiateTransfer } from '../api/custody';
import { getDirectory } from '../api/users';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { getErrorMessage } from '../api/errorMessage';
import Alert from '../components/Alert';

const EVIDENCE_TYPES = ['PHYSICAL', 'DIGITAL', 'DOCUMENT', 'PHOTO', 'OTHER'];

function CreateEvidence() {
  const { user } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();

  const [description, setDescription] = useState('');
  const [type, setType] = useState(EVIDENCE_TYPES[0]);
  const [collectedAt, setCollectedAt] = useState('');
  const [collectedLocation, setCollectedLocation] = useState('');
  const [recipientId, setRecipientId] = useState('');
  const [directory, setDirectory] = useState([]);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    getDirectory()
      .then((users) => setDirectory(users.filter((d) => d.id !== user.id)))
      .catch(() => {});
  }, [user.id]);

  const canCreate = user.role === 'ADMIN' || user.role === 'OFFICER';
  if (!canCreate) {
    return (
      <Alert>Your role ({user.role}) cannot log new evidence. Only Officers and Admins can.</Alert>
    );
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      const evidence = await createEvidence({
        description,
        type,
        collectedAt: new Date(collectedAt).toISOString(),
        collectedLocation: collectedLocation || undefined,
      });

      if (!recipientId) {
        toast.success('Evidence logged.');
        navigate(`/evidence/${evidence.id}`);
        return;
      }

      // Choosing a recipient here folds two steps into one: confirming
      // collection (a prerequisite for any transfer) and initiating the
      // handoff, so the officer doesn't have to log the item, then reopen
      // it, then confirm, then transfer, as four separate actions.
      try {
        await confirmCollection(evidence.id);
        await initiateTransfer(evidence.id, recipientId);
        toast.success('Evidence logged and transfer initiated.');
      } catch (handoffErr) {
        toast.error(
          `Evidence was logged, but the transfer could not be started: ${getErrorMessage(handoffErr)}`,
        );
      }
      navigate(`/evidence/${evidence.id}`);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto flex max-w-lg flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">
          Log new evidence
        </h1>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          You become the logging officer and initial custodian of this item.
        </p>
      </div>

      <Alert>{error}</Alert>

      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
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
          <span className="font-medium text-slate-700 dark:text-slate-300">Type</span>
          <select
            value={type}
            onChange={(e) => setType(e.target.value)}
            className="rounded border border-slate-300 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
          >
            {EVIDENCE_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-slate-700 dark:text-slate-300">Collected at</span>
          <input
            type="datetime-local"
            required
            value={collectedAt}
            onChange={(e) => setCollectedAt(e.target.value)}
            className="rounded border border-slate-300 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-slate-700 dark:text-slate-300">
            Collected location <span className="text-slate-400">(optional)</span>
          </span>
          <input
            type="text"
            value={collectedLocation}
            onChange={(e) => setCollectedLocation(e.target.value)}
            className="rounded border border-slate-300 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-slate-700 dark:text-slate-300">Custody</span>
          <select
            value={recipientId}
            onChange={(e) => setRecipientId(e.target.value)}
            className="rounded border border-slate-300 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
          >
            <option value="">Keep in my custody</option>
            {directory.map((person) => (
              <option key={person.id} value={person.id}>
                Transfer to {person.fullName} ({person.role.name})
              </option>
            ))}
          </select>
          {recipientId && (
            <span className="text-xs text-slate-400">
              This confirms collection and immediately initiates a transfer — the recipient still
              has to accept it before custody actually changes.
            </span>
          )}
        </label>
        <button
          type="submit"
          disabled={submitting}
          className="rounded bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50 dark:bg-slate-100 dark:text-slate-900"
        >
          {submitting ? 'Saving…' : 'Log evidence'}
        </button>
      </form>
    </div>
  );
}

export default CreateEvidence;
