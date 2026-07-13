import { useEffect, useRef, useState } from 'react';
import * as usersApi from '../api/users';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { getErrorMessage } from '../api/errorMessage';
import Alert from '../components/Alert';
import Spinner from '../components/Spinner';

function downloadJson(data, filename) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function Profile() {
  const { user: sessionUser } = useAuth();
  const toast = useToast();
  const fileInputRef = useRef(null);

  const [profile, setProfile] = useState(null);
  const [fullName, setFullName] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [importing, setImporting] = useState(false);

  useEffect(() => {
    usersApi
      .getOwnProfile()
      .then((p) => {
        setProfile(p);
        setFullName(p.fullName);
      })
      .catch((err) => setError(getErrorMessage(err)));
  }, []);

  async function handleSave(e) {
    e.preventDefault();
    setError('');
    setSaving(true);
    try {
      const updated = await usersApi.updateOwnProfile({ fullName });
      setProfile((p) => ({ ...p, ...updated }));
      toast.success('Profile updated.');
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  async function handleExport() {
    setError('');
    setExporting(true);
    try {
      const data = await usersApi.exportOwnData();
      downloadJson(data, 'my-data-export.json');
      toast.success('Export downloaded.');
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setExporting(false);
    }
  }

  // Only the fullName field from a previously exported file is ever applied
  // — see users.service.js's importOwnProfile for why the rest of the file
  // (evidence, sessions, audit history) is intentionally not writable here.
  async function handleImportFile(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    setError('');
    setImporting(true);
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      const importedFullName = parsed?.user?.fullName;
      if (!importedFullName) {
        throw new Error('That file does not look like a profile export (no user.fullName found).');
      }
      const updated = await usersApi.importOwnProfile({ fullName: importedFullName });
      setProfile((p) => ({ ...p, ...updated }));
      setFullName(updated.fullName);
      toast.success('Profile imported.');
    } catch (err) {
      setError(err instanceof SyntaxError ? 'That file is not valid JSON.' : getErrorMessage(err));
    } finally {
      setImporting(false);
    }
  }

  if (!profile) {
    return (
      <div className="flex flex-col gap-6">
        <Alert>{error}</Alert>
        {!error && <Spinner label="Loading your profile…" />}
      </div>
    );
  }

  return (
    <div className="flex max-w-lg flex-col gap-8">
      <div>
        <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">My Profile</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          View and manage your own account details.
        </p>
      </div>

      <Alert>{error}</Alert>

      <section className="rounded border border-slate-200 bg-white p-5 dark:border-slate-700 dark:bg-slate-800">
        <dl className="grid grid-cols-3 gap-y-2 text-sm">
          <dt className="text-slate-500 dark:text-slate-400">Email</dt>
          <dd className="col-span-2 text-slate-900 dark:text-slate-100">{profile.email}</dd>
          <dt className="text-slate-500 dark:text-slate-400">Role</dt>
          <dd className="col-span-2 text-slate-900 dark:text-slate-100">{profile.role.name}</dd>
          <dt className="text-slate-500 dark:text-slate-400">MFA</dt>
          <dd className="col-span-2 text-slate-900 dark:text-slate-100">
            {profile.mfaEnabled ? 'Enabled' : 'Not enabled'}
          </dd>
          <dt className="text-slate-500 dark:text-slate-400">Member since</dt>
          <dd className="col-span-2 text-slate-900 dark:text-slate-100">
            {new Date(profile.createdAt).toLocaleDateString()}
          </dd>
        </dl>
      </section>

      <form
        onSubmit={handleSave}
        className="flex flex-col gap-4 rounded border border-slate-200 bg-white p-5 dark:border-slate-700 dark:bg-slate-800"
      >
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-slate-700 dark:text-slate-300">Full name</span>
          <input
            type="text"
            required
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            className="rounded border border-slate-300 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
          />
          <span className="text-xs text-slate-400">
            The only profile field you can edit directly — role and account status are managed by an
            Admin.
          </span>
        </label>
        <button
          type="submit"
          disabled={saving || fullName === profile.fullName}
          className="self-start rounded bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50 dark:bg-slate-100 dark:text-slate-900"
        >
          {saving ? 'Saving…' : 'Save changes'}
        </button>
      </form>

      <section className="flex flex-col gap-3 rounded border border-slate-200 bg-white p-5 dark:border-slate-700 dark:bg-slate-800">
        <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-300">Your data</h2>
        <p className="text-xs text-slate-500 dark:text-slate-400">
          Download everything this account owns — profile, evidence you&apos;ve logged or hold,
          custody transfers, sessions, and your audit trail — as a JSON file. Re-importing a file
          only ever restores the full name field; everything else in it is historical record, not
          writable.
        </p>
        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={handleExport}
            disabled={exporting}
            className="rounded border border-slate-300 px-3 py-2 text-sm text-slate-700 hover:bg-slate-100 disabled:opacity-50 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-700"
          >
            {exporting ? 'Preparing export…' : 'Export my data'}
          </button>
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={importing}
            className="rounded border border-slate-300 px-3 py-2 text-sm text-slate-700 hover:bg-slate-100 disabled:opacity-50 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-700"
          >
            {importing ? 'Importing…' : 'Import from file'}
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="application/json"
            className="hidden"
            onChange={handleImportFile}
          />
        </div>
      </section>

      {sessionUser.id !== profile.id && (
        // Should never actually render — profile always reflects the signed-in
        // user's own account — but a mismatch here would mean something is
        // badly wrong, so surface it loudly instead of silently trusting it.
        <Alert>Loaded profile does not match the signed-in session.</Alert>
      )}
    </div>
  );
}

export default Profile;
