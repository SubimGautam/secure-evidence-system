import { Link } from 'react-router-dom';

function NotFound() {
  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col items-center justify-center gap-3 px-6 text-center">
      <h1 className="text-2xl font-semibold">Page not found</h1>
      <Link to="/" className="text-sm text-slate-500 underline dark:text-slate-400">
        Back home
      </Link>
    </main>
  );
}

export default NotFound;
