import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { uploadEvidenceFile } from '../api/evidence';
import { useToast } from '../context/ToastContext';
import { getErrorMessage } from '../api/errorMessage';
import Alert from '../components/Alert';

const ACCEPTED = '.jpg,.jpeg,.png,.webp,.pdf,.txt,.doc,.docx';

function UploadEvidenceFile() {
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();

  const [file, setFile] = useState(null);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!file) return;
    setError('');
    setSubmitting(true);
    try {
      await uploadEvidenceFile(id, file, (progressEvent) => {
        setProgress(Math.round((progressEvent.loaded / progressEvent.total) * 100));
      });
      toast.success('File uploaded.');
      navigate(`/evidence/${id}`);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto flex max-w-lg flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">Upload a file</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Encrypted at rest as soon as it reaches the server. Max 10MB — images, PDF, plain text, or
          Word documents.
        </p>
      </div>

      <Alert>{error}</Alert>

      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <input
          type="file"
          required
          accept={ACCEPTED}
          onChange={(e) => setFile(e.target.files[0] ?? null)}
          className="rounded border border-slate-300 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
        />
        {file && (
          <p className="text-xs text-slate-500 dark:text-slate-400">
            {file.name} · {(file.size / 1024).toFixed(1)} KB
          </p>
        )}
        {submitting && (
          <div className="h-1.5 w-full overflow-hidden rounded bg-slate-200 dark:bg-slate-700">
            <div
              className="h-full bg-slate-900 transition-all dark:bg-slate-100"
              style={{ width: `${progress}%` }}
            />
          </div>
        )}
        <div className="flex gap-2">
          <button
            type="submit"
            disabled={submitting || !file}
            className="rounded bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50 dark:bg-slate-100 dark:text-slate-900"
          >
            {submitting ? `Uploading… ${progress}%` : 'Upload'}
          </button>
          <button
            type="button"
            onClick={() => navigate(`/evidence/${id}`)}
            className="rounded border border-slate-300 px-3 py-2 text-sm text-slate-600 dark:border-slate-600 dark:text-slate-300"
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}

export default UploadEvidenceFile;
