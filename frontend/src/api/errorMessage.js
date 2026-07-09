// Every backend error is either { error: string } or, for validation
// failures, { error: 'Validation failed', issues: [{ path, message }] } —
// this normalizes both into one string for a form to display.
export function getErrorMessage(err) {
  const data = err?.response?.data;
  if (!data) return err?.message || 'Something went wrong. Please try again.';
  if (Array.isArray(data.issues) && data.issues.length > 0) {
    return data.issues.map((issue) => issue.message).join(' ');
  }
  return data.error || 'Something went wrong. Please try again.';
}
