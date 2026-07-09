// Shared between Evidence.status and CustodyTransfer.status — PENDING
// means different things on each (unconfirmed intake vs. an unanswered
// handshake) but reads the same visually: "something is awaiting action."
const STATUS_STYLES = {
  PENDING: 'bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300',
  COLLECTED: 'bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-200',
  IN_CUSTODY: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300',
  RELEASED_FOR_COURT: 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300',
  RETURNED: 'bg-cyan-100 text-cyan-700 dark:bg-cyan-900 dark:text-cyan-300',
  ARCHIVED: 'bg-slate-200 text-slate-600 dark:bg-slate-600 dark:text-slate-300',
  ACCEPTED: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300',
  REJECTED: 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300',
  CANCELLED: 'bg-slate-200 text-slate-600 dark:bg-slate-600 dark:text-slate-300',
};

function StatusBadge({ status }) {
  const style = STATUS_STYLES[status] ?? 'bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-200';
  return (
    <span className={`inline-block rounded px-2 py-0.5 text-xs font-medium ${style}`}>
      {status.replace(/_/g, ' ')}
    </span>
  );
}

export default StatusBadge;
