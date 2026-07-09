import { useState } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const navLinkClass = ({ isActive }) =>
  `rounded px-3 py-1.5 text-sm font-medium transition-colors ${
    isActive
      ? 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900'
      : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'
  }`;

function Layout() {
  const { user, logout } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);

  const canAudit = user.role === 'AUDITOR' || user.role === 'ADMIN';
  const isAdmin = user.role === 'ADMIN';

  const links = (
    <>
      <NavLink to="/dashboard" className={navLinkClass} onClick={() => setMenuOpen(false)}>
        Dashboard
      </NavLink>
      <NavLink to="/evidence" className={navLinkClass} onClick={() => setMenuOpen(false)}>
        Evidence
      </NavLink>
      {canAudit && (
        <>
          <NavLink to="/audit-log" className={navLinkClass} onClick={() => setMenuOpen(false)}>
            Audit Log
          </NavLink>
          <NavLink to="/audit-log/verify" className={navLinkClass} onClick={() => setMenuOpen(false)}>
            Verify Chain
          </NavLink>
          <NavLink to="/custody-history" className={navLinkClass} onClick={() => setMenuOpen(false)}>
            Custody History
          </NavLink>
        </>
      )}
      {isAdmin && (
        <NavLink to="/admin" className={navLinkClass} onClick={() => setMenuOpen(false)}>
          Admin
        </NavLink>
      )}
    </>
  );

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900">
      <header className="border-b border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-800">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3 sm:px-6">
          <div className="flex items-center gap-6">
            <span className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              Evidence Custody
            </span>
            <nav className="hidden flex-wrap gap-1 lg:flex">{links}</nav>
          </div>

          <div className="hidden items-center gap-3 text-sm lg:flex">
            <span className="text-slate-500 dark:text-slate-400">
              {user.fullName} <span className="text-slate-400">· {user.role}</span>
            </span>
            <button
              type="button"
              onClick={logout}
              className="rounded border border-slate-300 px-3 py-1.5 text-slate-600 hover:bg-slate-100 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-700"
            >
              Log out
            </button>
          </div>

          <button
            type="button"
            onClick={() => setMenuOpen((v) => !v)}
            aria-label="Toggle menu"
            aria-expanded={menuOpen}
            className="rounded border border-slate-300 p-2 text-slate-600 dark:border-slate-600 dark:text-slate-300 lg:hidden"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
              {menuOpen ? (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              ) : (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              )}
            </svg>
          </button>
        </div>

        {menuOpen && (
          <div className="flex flex-col gap-3 border-t border-slate-200 px-4 py-3 dark:border-slate-700 lg:hidden">
            <nav className="flex flex-col gap-1">{links}</nav>
            <div className="flex items-center justify-between border-t border-slate-200 pt-3 text-sm dark:border-slate-700">
              <span className="text-slate-500 dark:text-slate-400">
                {user.fullName} · {user.role}
              </span>
              <button
                type="button"
                onClick={logout}
                className="rounded border border-slate-300 px-3 py-1.5 text-slate-600 dark:border-slate-600 dark:text-slate-300"
              >
                Log out
              </button>
            </div>
          </div>
        )}
      </header>
      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
        <Outlet />
      </main>
    </div>
  );
}

export default Layout;
