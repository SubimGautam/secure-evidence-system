import { Fragment, useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  listUsers,
  updateUserRole,
  updateUserStatus,
  lockUser,
  unlockUser,
  resetUserMfa,
  listUserSessions,
  revokeUserSession,
  getSystemHealth,
} from '../api/admin';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { getErrorMessage } from '../api/errorMessage';
import Alert from '../components/Alert';
import Spinner from '../components/Spinner';
import EmptyState from '../components/EmptyState';

const ROLES = ['ADMIN', 'OFFICER', 'EVIDENCE_CUSTODIAN', 'AUDITOR'];

function formatDate(value) {
  return new Date(value).toLocaleString();
}

function HealthCard({ label, value, tone = 'default' }) {
  const toneClass =
    tone === 'ok'
      ? 'text-emerald-600 dark:text-emerald-400'
      : tone === 'bad'
        ? 'text-red-600 dark:text-red-400'
        : 'text-slate-900 dark:text-slate-100';
  return (
    <div className="rounded border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-800">
      <div className={`text-2xl font-semibold ${toneClass}`}>{value}</div>
      <div className="mt-1 text-xs uppercase tracking-wide text-slate-400">{label}</div>
    </div>
  );
}

function AdminDashboard() {
  const { user: currentUser } = useAuth();
  const toast = useToast();

  const [health, setHealth] = useState(null);
  const [users, setUsers] = useState(null);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [expandedSessionsFor, setExpandedSessionsFor] = useState(null);
  const [sessions, setSessions] = useState(null);
  const [busyUserId, setBusyUserId] = useState(null);

  const loadUsers = useCallback(() => {
    return listUsers()
      .then(setUsers)
      .catch((err) => setError(getErrorMessage(err)));
  }, []);

  const isAdmin = currentUser.role === 'ADMIN';

  useEffect(() => {
    if (!isAdmin) return;
    getSystemHealth()
      .then(setHealth)
      .catch((err) => setError(getErrorMessage(err)));
    loadUsers();
  }, [isAdmin, loadUsers]);

  const filteredUsers = useMemo(() => {
    if (!users) return [];
    return users.filter((u) => {
      const matchesSearch =
        !search ||
        u.fullName.toLowerCase().includes(search.toLowerCase()) ||
        u.email.toLowerCase().includes(search.toLowerCase());
      const matchesRole = !roleFilter || u.role.name === roleFilter;
      return matchesSearch && matchesRole;
    });
  }, [users, search, roleFilter]);

  if (!isAdmin) {
    return <Alert>Your role ({currentUser.role}) does not have access to the admin dashboard.</Alert>;
  }

  async function runAction(userId, action) {
    setBusyUserId(userId);
    try {
      await action();
      await loadUsers();
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setBusyUserId(null);
    }
  }

  async function handleRoleChange(u, role) {
    if (role === u.role.name) return;
    await runAction(u.id, async () => {
      await updateUserRole(u.id, role);
      toast.success(`${u.fullName}'s role changed to ${role}.`);
    });
  }

  async function handleToggleStatus(u) {
    const isActive = !!u.deletedAt;
    await runAction(u.id, async () => {
      await updateUserStatus(u.id, isActive);
      toast.success(`${u.fullName} ${isActive ? 'reactivated' : 'deactivated'}.`);
    });
  }

  async function handleToggleLock(u) {
    const isLocked = u.lockedUntil && new Date(u.lockedUntil) > new Date();
    await runAction(u.id, async () => {
      if (isLocked) await unlockUser(u.id);
      else await lockUser(u.id);
      toast.success(`${u.fullName} ${isLocked ? 'unlocked' : 'locked'}.`);
    });
  }

  async function handleResetMfa(u) {
    await runAction(u.id, async () => {
      await resetUserMfa(u.id);
      toast.success(`MFA reset for ${u.fullName}.`);
    });
  }

  async function toggleSessions(u) {
    if (expandedSessionsFor === u.id) {
      setExpandedSessionsFor(null);
      return;
    }
    setExpandedSessionsFor(u.id);
    setSessions(null);
    try {
      setSessions(await listUserSessions(u.id));
    } catch (err) {
      toast.error(getErrorMessage(err));
    }
  }

  async function handleRevokeSession(u, sessionId) {
    try {
      await revokeUserSession(u.id, sessionId);
      setSessions(await listUserSessions(u.id));
      toast.success('Session revoked.');
    } catch (err) {
      toast.error(getErrorMessage(err));
    }
  }

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">Admin dashboard</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          User management and system health.{' '}
          <Link to="/audit-log" className="underline">
            View the audit log →
          </Link>
        </p>
      </div>

      <Alert>{error}</Alert>

      {/* System health */}
      <section>
        <h2 className="mb-3 text-sm font-semibold text-slate-700 dark:text-slate-300">System health</h2>
        {health === null ? (
          <Spinner label="Checking system health…" />
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            <HealthCard label="Status" value={health.status} tone={health.status === 'ok' ? 'ok' : 'bad'} />
            <HealthCard
              label="Database"
              value={health.database}
              tone={health.database === 'connected' ? 'ok' : 'bad'}
            />
            <HealthCard label="Uptime" value={`${Math.floor(health.uptimeSeconds / 60)}m`} />
            <HealthCard label="Active users" value={health.counts.activeUsers} />
            <HealthCard label="Evidence items" value={health.counts.evidenceItems} />
            <HealthCard label="Active sessions" value={health.counts.activeSessions} />
          </div>
        )}
      </section>

      {/* Users */}
      <section>
        <h2 className="mb-3 text-sm font-semibold text-slate-700 dark:text-slate-300">Users</h2>

        <div className="mb-3 flex flex-wrap items-center gap-2">
          <input
            type="search"
            placeholder="Search by name or email…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full max-w-xs rounded border border-slate-300 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
          />
          <select
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value)}
            className="rounded border border-slate-300 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
          >
            <option value="">All roles</option>
            {ROLES.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </div>

        {users === null ? (
          <Spinner label="Loading users…" />
        ) : filteredUsers.length === 0 ? (
          <EmptyState title="No users match" />
        ) : (
          <div className="overflow-x-auto rounded border border-slate-200 dark:border-slate-700">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-100 text-xs uppercase tracking-wide text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                <tr>
                  <th className="px-4 py-2">User</th>
                  <th className="px-4 py-2">Role</th>
                  <th className="px-4 py-2">Status</th>
                  <th className="px-4 py-2">MFA</th>
                  <th className="px-4 py-2 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 bg-white dark:divide-slate-700 dark:bg-slate-800">
                {filteredUsers.map((u) => {
                  const isSelf = u.id === currentUser.id;
                  const isDeactivated = !!u.deletedAt;
                  const isLocked = u.lockedUntil && new Date(u.lockedUntil) > new Date();
                  const busy = busyUserId === u.id;
                  return (
                    <Fragment key={u.id}>
                      <tr className="align-top hover:bg-slate-50 dark:hover:bg-slate-700/50">
                        <td className="px-4 py-2">
                          <p className="text-slate-800 dark:text-slate-100">
                            {u.fullName} {isSelf && <span className="text-xs text-slate-400">(you)</span>}
                          </p>
                          <p className="text-xs text-slate-400">{u.email}</p>
                        </td>
                        <td className="px-4 py-2">
                          <select
                            value={u.role.name}
                            disabled={isSelf || busy}
                            onChange={(e) => handleRoleChange(u, e.target.value)}
                            className="rounded border border-slate-300 px-2 py-1 text-xs disabled:opacity-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
                          >
                            {ROLES.map((r) => (
                              <option key={r} value={r}>
                                {r}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="px-4 py-2">
                          <div className="flex flex-col gap-1">
                            <span
                              className={`w-fit rounded px-2 py-0.5 text-xs font-medium ${
                                isDeactivated
                                  ? 'bg-slate-200 text-slate-600 dark:bg-slate-600 dark:text-slate-300'
                                  : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300'
                              }`}
                            >
                              {isDeactivated ? 'Deactivated' : 'Active'}
                            </span>
                            {isLocked && (
                              <span className="w-fit rounded bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700 dark:bg-red-900 dark:text-red-300">
                                Locked
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-2 text-xs text-slate-500 dark:text-slate-400">
                          {u.mfaEnabled ? 'Enabled' : 'Disabled'}
                        </td>
                        <td className="px-4 py-2">
                          <div className="flex flex-wrap justify-end gap-1.5">
                            <button
                              type="button"
                              disabled={isSelf || busy}
                              onClick={() => handleToggleStatus(u)}
                              className="rounded border border-slate-300 px-2 py-1 text-xs text-slate-600 hover:bg-slate-100 disabled:opacity-40 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-700"
                            >
                              {isDeactivated ? 'Activate' : 'Deactivate'}
                            </button>
                            <button
                              type="button"
                              disabled={isSelf || busy}
                              onClick={() => handleToggleLock(u)}
                              className="rounded border border-slate-300 px-2 py-1 text-xs text-slate-600 hover:bg-slate-100 disabled:opacity-40 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-700"
                            >
                              {isLocked ? 'Unlock' : 'Lock'}
                            </button>
                            {u.mfaEnabled && u.role.name !== 'ADMIN' && (
                              <button
                                type="button"
                                disabled={busy}
                                onClick={() => handleResetMfa(u)}
                                className="rounded border border-slate-300 px-2 py-1 text-xs text-slate-600 hover:bg-slate-100 disabled:opacity-40 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-700"
                              >
                                Reset MFA
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => toggleSessions(u)}
                              className="rounded border border-slate-300 px-2 py-1 text-xs text-slate-600 hover:bg-slate-100 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-700"
                            >
                              {expandedSessionsFor === u.id ? 'Hide sessions' : 'Sessions'}
                            </button>
                          </div>
                        </td>
                      </tr>
                      {expandedSessionsFor === u.id && (
                        <tr>
                          <td colSpan={5} className="bg-slate-50 px-4 py-3 dark:bg-slate-900">
                            {sessions === null ? (
                              <Spinner label="Loading sessions…" />
                            ) : sessions.length === 0 ? (
                              <p className="text-xs text-slate-400">No active sessions.</p>
                            ) : (
                              <ul className="flex flex-col gap-1.5">
                                {sessions.map((s) => (
                                  <li
                                    key={s.id}
                                    className="flex items-center justify-between rounded border border-slate-200 bg-white px-3 py-1.5 text-xs dark:border-slate-700 dark:bg-slate-800"
                                  >
                                    <span className="text-slate-600 dark:text-slate-300">
                                      {s.userAgent ?? 'Unknown device'} · {s.ipAddress ?? 'unknown IP'} · last
                                      used {formatDate(s.lastUsedAt)}
                                    </span>
                                    <button
                                      type="button"
                                      onClick={() => handleRevokeSession(u, s.id)}
                                      className="ml-3 shrink-0 text-red-600 underline dark:text-red-400"
                                    >
                                      Revoke
                                    </button>
                                  </li>
                                ))}
                              </ul>
                            )}
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

export default AdminDashboard;
