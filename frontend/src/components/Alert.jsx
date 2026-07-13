const VARIANTS = {
  error:
    'border-red-200 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300',
  success:
    'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-300',
};

function Alert({ variant = 'error', children }) {
  if (!children) return null;
  return <div className={`rounded border px-3 py-2 text-sm ${VARIANTS[variant]}`}>{children}</div>;
}

export default Alert;
